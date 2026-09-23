import { unwrap, unwrapCount } from "@/lib/data/query";
import { getSupabase } from "@/lib/supabase/server";

/** Admin reads. RLS lets admin/reviewer roles see across the cohort. */

export type QueueItem = {
  submissionId: string;
  version: number;
  status: string;
  isLate: boolean;
  submittedAt: string | null;
  urls: string[];
  textResponse: string | null;
  reviewNote: string | null;
  files: { id: string; filename: string; storagePath: string }[];
  participantName: string;
  participantEmail: string;
  itemType: "assignment" | "program_task";
  itemTitle: string;
  weekNumber: number | null;
};

export async function isAdmin(): Promise<boolean> {
  const supabase = await getSupabase();
  const { data } = await supabase.rpc("is_admin");
  return Boolean(data);
}

export async function getReviewQueue(filter: "pending" | "all" = "pending"): Promise<QueueItem[]> {
  const supabase = await getSupabase();

  let query = supabase
    .from("submissions")
    .select(
      "id, item_type, item_id, version, status, is_late, urls, text_response, review_note, " +
        "submitted_at, enrollments!inner(name, email), submission_files(id, filename, storage_path)",
    )
    .neq("status", "draft")
    // Oldest first: the person who has been waiting longest is reviewed first.
    .order("submitted_at", { ascending: true });

  if (filter === "pending") query = query.in("status", ["submitted", "under_review"]);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (!rows.length) return [];

  // Resolve item titles in two batched lookups rather than per row.
  const assignmentIds = rows.filter((r) => r.item_type === "assignment").map((r) => r.item_id);
  const taskIds = rows.filter((r) => r.item_type === "program_task").map((r) => r.item_id);

  const [assignmentsRes, tasksRes] = await Promise.all([
    assignmentIds.length
      ? supabase
          .from("assignments")
          .select("id, title, modules(week_modules(program_weeks(number)))")
          .in("id", assignmentIds)
      : Promise.resolve({ data: [] }),
    taskIds.length
      ? supabase.from("program_tasks").select("id, title, program_weeks(number)").in("id", taskIds)
      : Promise.resolve({ data: [] }),
  ]);
  const assignments = unwrap(assignmentsRes, "assignments");
  const tasks = unwrap(tasksRes, "tasks");

  const titles = new Map<string, { title: string; week: number | null }>();
  for (const a of (assignments ?? []) as unknown as Record<string, unknown>[]) {
    const mod = a.modules as {
      week_modules: { program_weeks: { number: number } | null }[];
    } | null;
    titles.set(a.id as string, {
      title: a.title as string,
      week: mod?.week_modules?.[0]?.program_weeks?.number ?? null,
    });
  }
  for (const t of (tasks ?? []) as unknown as Record<string, unknown>[]) {
    const week = t.program_weeks as { number: number } | null;
    titles.set(t.id as string, { title: t.title as string, week: week?.number ?? null });
  }

  return rows.map((r) => {
    const enrollment = r.enrollments as { name: string | null; email: string };
    const meta = titles.get(r.item_id as string);

    return {
      submissionId: r.id as string,
      version: r.version as number,
      status: r.status as string,
      isLate: Boolean(r.is_late),
      submittedAt: (r.submitted_at as string) ?? null,
      urls: Array.isArray(r.urls) ? (r.urls as string[]) : [],
      textResponse: (r.text_response as string) ?? null,
      reviewNote: (r.review_note as string) ?? null,
      files: ((r.submission_files as Record<string, unknown>[]) ?? []).map((f) => ({
        id: f.id as string,
        filename: f.filename as string,
        storagePath: f.storage_path as string,
      })),
      participantName: enrollment?.name ?? enrollment?.email ?? "Unknown",
      participantEmail: enrollment?.email ?? "",
      itemType: r.item_type as "assignment" | "program_task",
      itemTitle: meta?.title ?? "Untitled",
      weekNumber: meta?.week ?? null,
    };
  });
}

export async function getCohortStats() {
  const supabase = await getSupabase();

  const [participantsRes, pendingRes, submittedRes] = await Promise.all([
    supabase.from("enrollments").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("submissions")
      .select("*", { count: "exact", head: true })
      .in("status", ["submitted", "under_review"]),
    supabase.from("submissions").select("*", { count: "exact", head: true }).neq("status", "draft"),
  ]);
  const participants = unwrapCount(participantsRes, "participants");
  const pending = unwrapCount(pendingRes, "pending");
  const submitted = unwrapCount(submittedRes, "submitted");

  return {
    participants: participants ?? 0,
    awaitingReview: pending ?? 0,
    totalSubmissions: submitted ?? 0,
  };
}

// ---------------------------------------------------------- participants ----

export type HealthState = "active" | "needs_attention" | "at_risk" | "dormant";

export type ParticipantRow = {
  enrollmentId: string;
  name: string;
  email: string;
  status: string;
  health: HealthState;
  progressPct: number;
  weeksCompleted: number;
  lastActiveAt: string | null;
  submissionCount: number;
  currentWeekTask: "submitted" | "missing";
};

export type ParticipantFilter = {
  health?: HealthState;
  status?: string;
  q?: string;
  task?: "missing" | "submitted";
};

export async function getParticipants(filter: ParticipantFilter = {}): Promise<ParticipantRow[]> {
  const supabase = await getSupabase();

  let query = supabase
    .from("enrollments")
    .select("id, name, email, status, health, progress_pct, weeks_completed, last_active_at")
    .order("progress_pct", { ascending: false });

  if (filter.health) query = query.eq("health", filter.health);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.q) query = query.or(`email.ilike.%${filter.q}%,name.ilike.%${filter.q}%`);

  const [rowsRes, subsRes, currentTaskRes] = await Promise.all([
    query,
    supabase.from("submissions").select("enrollment_id, item_id").neq("status", "draft"),
    // The task for the week that is current right now.
    supabase
      .from("program_tasks")
      .select("id, program_weeks!inner(release_at)")
      .lte("program_weeks.release_at", new Date().toISOString())
      .order("program_weeks(release_at)", { ascending: false })
      .limit(1),
  ]);
  const rows = unwrap(rowsRes, "participants");
  const subs = unwrap(subsRes, "submissions");
  const currentTask = unwrap(currentTaskRes, "current task");

  const currentTaskId = (currentTask as unknown as { id: string }[] | null)?.[0]?.id ?? null;

  const counts = new Map<string, number>();
  const taskDone = new Set<string>();
  for (const s of (subs ?? []) as unknown as { enrollment_id: string; item_id: string }[]) {
    counts.set(s.enrollment_id, (counts.get(s.enrollment_id) ?? 0) + 1);
    if (currentTaskId && s.item_id === currentTaskId) taskDone.add(s.enrollment_id);
  }

  const participants = (rows ?? []).map((r) => ({
    enrollmentId: r.id,
    name: r.name ?? r.email,
    email: r.email,
    status: r.status,
    health: r.health as HealthState,
    progressPct: Number(r.progress_pct ?? 0),
    weeksCompleted: r.weeks_completed ?? 0,
    lastActiveAt: r.last_active_at,
    submissionCount: counts.get(r.id) ?? 0,
    currentWeekTask: (taskDone.has(r.id) ? "submitted" : "missing") as "submitted" | "missing",
  }));

  return filter.task ? participants.filter((p) => p.currentWeekTask === filter.task) : participants;
}

export async function getParticipantDetail(enrollmentId: string) {
  const supabase = await getSupabase();

  const [enrollmentRes, activityRes, submissionsRes, weeksRes] = await Promise.all([
    supabase
      .from("enrollments")
      .select(
        "id, name, email, status, status_reason, health, progress_pct, weeks_completed, " +
          "last_active_at, enrolled_at, admin_notes",
      )
      .eq("id", enrollmentId)
      .maybeSingle(),
    supabase
      .from("activity_events")
      .select("id, type, occurred_at, metadata")
      .eq("enrollment_id", enrollmentId)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase
      .from("submissions")
      .select("id, item_type, item_id, version, status, is_late, submitted_at, review_note")
      .eq("enrollment_id", enrollmentId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("week_progress")
      .select(
        "week_id, modules_completed, modules_total, assignments_submitted, " +
          "assignments_total, tasks_submitted, tasks_total, is_complete, " +
          "program_weeks(number, title)",
      )
      .eq("enrollment_id", enrollmentId),
  ]);
  const enrollment = unwrap(enrollmentRes, "enrollment");
  const activity = unwrap(activityRes, "activity");
  const submissions = unwrap(submissionsRes, "submissions");
  const weeks = unwrap(weeksRes, "the programme");

  if (!enrollment) return null;

  const e = enrollment as unknown as {
    id: string;
    name: string | null;
    email: string;
    status: string;
    status_reason: string | null;
    health: HealthState;
    progress_pct: number;
    weeks_completed: number;
    last_active_at: string | null;
    enrolled_at: string;
    admin_notes: string | null;
  };

  const weekRows = (weeks ?? []) as unknown as {
    modules_completed: number;
    modules_total: number;
    assignments_submitted: number;
    assignments_total: number;
    tasks_submitted: number;
    tasks_total: number;
    is_complete: boolean;
    program_weeks: { number: number; title: string } | null;
  }[];

  return {
    enrollment: e,
    activity: (activity ?? []) as { id: number; type: string; occurred_at: string }[],
    submissions: (submissions ?? []) as unknown as {
      id: string;
      item_type: string;
      version: number;
      status: string;
      is_late: boolean;
      submitted_at: string | null;
      review_note: string | null;
    }[],
    weeks: weekRows
      .map((w) => ({
        number: w.program_weeks?.number ?? 0,
        title: w.program_weeks?.title ?? "",
        modulesCompleted: w.modules_completed,
        modulesTotal: w.modules_total,
        assignmentsSubmitted: w.assignments_submitted,
        assignmentsTotal: w.assignments_total,
        tasksSubmitted: w.tasks_submitted,
        tasksTotal: w.tasks_total,
        isComplete: w.is_complete,
      }))
      .sort((a, b) => a.number - b.number),
  };
}

/** Per-week funnel for the overview (PRD F11). */
export async function getWeekFunnel() {
  const supabase = await getSupabase();

  const [weeksRes, progressRes, totalRes] = await Promise.all([
    supabase.from("program_weeks").select("id, number, title, release_at").order("number"),
    supabase
      .from("week_progress")
      .select("week_id, is_complete, task_submitted, modules_completed"),
    supabase.from("enrollments").select("*", { count: "exact", head: true }).eq("status", "active"),
  ]);
  const weeks = unwrap(weeksRes, "the programme");
  const progress = unwrap(progressRes, "participant progress");
  const total = unwrapCount(totalRes, "total");

  const byWeek = new Map<string, { complete: number; task: number; started: number }>();
  for (const p of progress ?? []) {
    const acc = byWeek.get(p.week_id) ?? { complete: 0, task: 0, started: 0 };
    if (p.is_complete) acc.complete += 1;
    if (p.task_submitted) acc.task += 1;
    if ((p.modules_completed ?? 0) > 0) acc.started += 1;
    byWeek.set(p.week_id, acc);
  }

  return (weeks ?? []).map((w) => ({
    number: w.number,
    title: w.title,
    released: new Date(w.release_at) <= new Date(),
    participants: total ?? 0,
    ...(byWeek.get(w.id) ?? { complete: 0, task: 0, started: 0 }),
  }));
}

export async function getHealthCounts(): Promise<Record<HealthState, number>> {
  const supabase = await getSupabase();
  const { data } = await supabase.from("enrollments").select("health").eq("status", "active");

  const counts: Record<HealthState, number> = {
    active: 0,
    needs_attention: 0,
    at_risk: 0,
    dormant: 0,
  };
  for (const r of data ?? []) counts[r.health as HealthState] += 1;
  return counts;
}

// ------------------------------------------------------- content editing ----

/** Everything the week editor needs, in one round trip. */
export async function getWeekForEdit(number: number) {
  const supabase = await getSupabase();

  const week = unwrap(
    await supabase
      .from("program_weeks")
      .select("id, cohort_id, number, title, theme, overview, release_at, deadline_at, image_url")
      .eq("number", number)
      .maybeSingle(),
    "week",
  );

  if (!week) return null;
  const w = week as unknown as {
    id: string;
    cohort_id: string;
    number: number;
    title: string;
    theme: string | null;
    overview: string | null;
    release_at: string;
    deadline_at: string;
    image_url: string | null;
  };

  const [linksRes, taskRes, materialsRes] = await Promise.all([
    supabase
      .from("week_modules")
      .select(
        '"order", modules!inner(id, code, slug, title, estimated_minutes, lessons(video_ref))',
      )
      .eq("week_id", w.id)
      .order("order"),
    supabase
      .from("program_tasks")
      .select(
        "id, title, brief, submission_types, deadline_at, " +
          "external_submission_url, external_submission_note",
      )
      .eq("week_id", w.id)
      .maybeSingle(),
    supabase
      .from("learning_materials")
      .select("id, title, description, type, url")
      .eq("owner_type", "week")
      .eq("owner_id", w.id)
      .order("order"),
  ]);
  const links = unwrap(linksRes, "the week's modules");
  const task = unwrap(taskRes, "task");
  const materials = unwrap(materialsRes, "resources");

  type LinkRow = {
    modules: {
      id: string;
      code: string | null;
      slug: string;
      title: string;
      estimated_minutes: number | null;
      lessons: { video_ref: string | null }[];
    };
  };

  return {
    week: w,
    modules: ((links ?? []) as unknown as LinkRow[]).map((l) => ({
      id: l.modules.id,
      code: l.modules.code ?? "",
      slug: l.modules.slug,
      title: l.modules.title,
      minutes: l.modules.estimated_minutes,
      hasVideo: Boolean(l.modules.lessons?.[0]?.video_ref),
    })),
    task: task as unknown as {
      id: string;
      title: string;
      brief: string;
      submission_types: string[];
      deadline_at: string | null;
      external_submission_url: string | null;
      external_submission_note: string | null;
    } | null,
    materials: (materials ?? []) as unknown as {
      id: string;
      title: string;
      description: string | null;
      type: string;
      url: string | null;
    }[],
  };
}

export async function getModuleForEdit(slug: string) {
  const supabase = await getSupabase();

  const { data } = await supabase
    .from("modules")
    .select(
      "id, code, slug, title, summary, what_you_will_learn, estimated_minutes, " +
        "lessons(id, video_ref), week_modules(program_weeks(number))",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;
  const m = data as unknown as {
    id: string;
    code: string | null;
    slug: string;
    title: string;
    summary: string | null;
    what_you_will_learn: unknown;
    estimated_minutes: number | null;
    lessons: { id: string; video_ref: string | null }[];
    week_modules: { program_weeks: { number: number } | null }[];
  };

  const [materialsRes, assignmentRes] = await Promise.all([
    supabase
      .from("learning_materials")
      .select("id, title, description, type, url, tags")
      .eq("owner_type", "module")
      .eq("owner_id", m.id)
      .order("order"),
    supabase
      .from("assignments")
      .select("id, title, brief, document_url")
      .eq("module_id", m.id)
      .maybeSingle(),
  ]);
  const materials = unwrap(materialsRes, "resources");
  const assignment = unwrap(assignmentRes, "assignment") as {
    id: string;
    title: string;
    brief: string;
    document_url: string | null;
  } | null;

  return {
    id: m.id,
    code: m.code ?? "",
    slug: m.slug,
    title: m.title,
    summary: m.summary ?? "",
    bullets: Array.isArray(m.what_you_will_learn) ? (m.what_you_will_learn as string[]) : [],
    minutes: m.estimated_minutes,
    lessonId: m.lessons?.[0]?.id ?? null,
    videoRef: m.lessons?.[0]?.video_ref ?? "",
    weekNumber: m.week_modules?.[0]?.program_weeks?.number ?? null,
    assignment,
    materials: (materials ?? []) as unknown as {
      id: string;
      title: string;
      description: string | null;
      type: string;
      url: string | null;
      tags: string[];
    }[],
  };
}

export async function getContentOverview() {
  const supabase = await getSupabase();

  const [weeksRes, cohortRes] = await Promise.all([
    supabase
      .from("program_weeks")
      .select("id, number, title, theme, release_at, deadline_at")
      .order("number"),
    supabase
      .from("cohorts")
      .select("id, name, submissions_open, leaderboard_visible, sessions_visible")
      .eq("code", "ugc-01")
      .maybeSingle(),
  ]);
  const weeks = unwrap(weeksRes, "the programme");
  const cohort = unwrap(cohortRes, "cohort");

  const counts = unwrap(
    await supabase.from("week_modules").select("week_id, modules!inner(lessons(video_ref))"),
    "counts",
  );

  const byWeek = new Map<string, { modules: number; missingVideo: number }>();
  for (const row of (counts ?? []) as unknown as {
    week_id: string;
    modules: { lessons: { video_ref: string | null }[] };
  }[]) {
    const acc = byWeek.get(row.week_id) ?? { modules: 0, missingVideo: 0 };
    acc.modules += 1;
    if (!row.modules.lessons?.[0]?.video_ref) acc.missingVideo += 1;
    byWeek.set(row.week_id, acc);
  }

  const tasks = unwrap(await supabase.from("program_tasks").select("week_id"), "tasks");
  const weeksWithTask = new Set((tasks ?? []).map((t) => t.week_id));

  return {
    cohort: cohort as unknown as {
      id: string;
      name: string;
      submissions_open: boolean;
      leaderboard_visible: boolean;
      sessions_visible: boolean;
    } | null,
    weeks: (
      (weeks ?? []) as unknown as {
        id: string;
        number: number;
        title: string;
        theme: string | null;
        release_at: string;
        deadline_at: string;
      }[]
    ).map((w) => ({
      ...w,
      released: new Date(w.release_at) <= new Date(),
      hasTask: weeksWithTask.has(w.id),
      ...(byWeek.get(w.id) ?? { modules: 0, missingVideo: 0 }),
    })),
  };
}

export type AdminSession = {
  id: string;
  speaker_name: string;
  speaker_title: string | null;
  topic: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
  join_url: string | null;
  replay_url: string | null;
  flyer_path: string | null;
  /** Signed, short-lived — the flyer bucket is private. */
  flyerUrl: string | null;
};

export async function getSessionsForAdmin(): Promise<AdminSession[]> {
  const supabase = await getSupabase();
  const rows = unwrap(
    await supabase
      .from("live_sessions")
      .select(
        "id, speaker_name, speaker_title, topic, description, starts_at, " +
          "duration_minutes, join_url, replay_url, flyer_path",
      )
      .order("starts_at", { ascending: false }),
    "sessions",
  ) as unknown as Omit<AdminSession, "flyerUrl">[];

  const paths = rows.map((r) => r.flyer_path).filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage
      .from("session-flyers")
      .createSignedUrls(paths, 900);
    for (const entry of urls ?? []) {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
  }

  return rows.map((r) => ({
    ...r,
    flyerUrl: r.flyer_path ? (signed.get(r.flyer_path) ?? null) : null,
  }));
}
