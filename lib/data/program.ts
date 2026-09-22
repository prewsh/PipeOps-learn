import { cache } from "react";
import { getSupabase } from "@/lib/supabase/server";

/**
 * Read layer for the participant app.
 *
 * Week gating is enforced by RLS, not here (AGENTS.md section 7) — a locked
 * week simply returns no modules, lessons or materials no matter what this
 * code asks for. The `state` computed below drives presentation only.
 */

export type WeekState = "locked" | "current" | "open";

export type Week = {
  id: string;
  number: number;
  title: string;
  theme: string | null;
  overview: string | null;
  releaseAt: string;
  deadlineAt: string;
  imageUrl: string | null;
  state: WeekState;
  modules: ModuleSummary[];
  /** Bonus modules are watchable but never required (PRD F8.4). */
  requiredCount: number;
  modulesComplete: number;
};

export type ModuleSummary = {
  id: string;
  number: number;
  /** Display label ("M10a", "BONUS") — decoupled from `number`, which orders. */
  code: string;
  isBonus: boolean;
  slug: string;
  title: string;
  estimatedMinutes: number | null;
  status: "not_started" | "in_progress" | "completed";
  percentageWatched: number;
  resumeAtSeconds: number;
};

export type Me = {
  userId: string;
  name: string;
  email: string;
  enrollmentId: string;
  cohortId: string;
  cohortName: string;
  /** Portal submissions are frozen while the flow is held back. */
  submissionsOpen: boolean;
  /** Cohort feature flags. Both default false — see migration …0024. */
  leaderboardVisible: boolean;
  sessionsVisible: boolean;
  progressPct: number;
  onboarded: boolean;
};

/** Current user plus their active enrolment. Null when not enrolled (F1.4). */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("enrollments")
    .select(
      "id, cohort_id, progress_pct, name, email, " +
        "cohorts!inner(name, status, starts_on, submissions_open, " +
        "leaderboard_visible, sessions_visible), users!inner(name, onboarded_at)",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .in("cohorts.status", ["active", "completed"])
    // Several enrolments is an allowed case (F2.2). Ordering is what makes
    // "which one" a defined answer rather than whichever row came back first.
    .order("starts_on", { ascending: false, referencedTable: "cohorts" })
    .limit(1);

  const data = rows?.[0];
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    cohort_id: string;
    progress_pct: number;
    name: string | null;
    email: string;
    cohorts: {
      name: string;
      submissions_open: boolean;
      leaderboard_visible: boolean;
      sessions_visible: boolean;
    };
    users: { name: string | null; onboarded_at: string | null };
  };
  const cohort = row.cohorts;
  const userRow = row.users;

  return {
    userId: user.id,
    // users.name is auto-derived from the email until onboarding sets a real
    // one, so the imported enrolment name is the better label before then.
    name: (userRow.onboarded_at ? userRow.name : null) ?? row.name ?? userRow.name ?? "there",
    email: row.email,
    enrollmentId: row.id,
    cohortId: row.cohort_id,
    cohortName: cohort.name,
    submissionsOpen: Boolean(cohort.submissions_open),
    leaderboardVisible: Boolean(cohort.leaderboard_visible),
    sessionsVisible: Boolean(cohort.sessions_visible),
    progressPct: Number(row.progress_pct ?? 0),
    onboarded: Boolean(userRow.onboarded_at),
  };
});

function stateFor(releaseAt: string, nextReleaseAt: string | undefined, now: Date): WeekState {
  if (new Date(releaseAt) > now) return "locked";
  if (nextReleaseAt && new Date(nextReleaseAt) <= now) return "open";
  return "current";
}

/** All weeks of the cohort. Locked weeks carry no modules — RLS sees to it. */
export const getWeeks = cache(async (): Promise<Week[]> => {
  const supabase = await getSupabase();
  const now = new Date();

  const { data: weeks } = await supabase
    .from("program_weeks")
    .select("id, number, title, theme, overview, release_at, deadline_at, image_url")
    .order("number");

  if (!weeks?.length) return [];

  const { data: links } = await supabase
    .from("week_modules")
    .select(
      'week_id, "order", modules!inner(id, number, code, is_bonus, slug, title, estimated_minutes, lessons(id))',
    )
    .order("order");

  const { data: progress } = await supabase.from("module_progress").select("module_id, status");

  const { data: video } = await supabase
    .from("video_progress")
    .select("lesson_id, percentage_watched, max_position_seconds");

  const progressBy = new Map((progress ?? []).map((p) => [p.module_id, p.status]));
  const videoBy = new Map((video ?? []).map((v) => [v.lesson_id, v]));

  return weeks.map((w, i) => {
    const state = stateFor(w.release_at, weeks[i + 1]?.release_at, now);

    const modules: ModuleSummary[] = (links ?? [])
      .filter((l) => l.week_id === w.id)
      .map((l) => {
        const m = l.modules as unknown as {
          id: string;
          number: number;
          code: string | null;
          is_bonus: boolean;
          slug: string;
          title: string;
          estimated_minutes: number | null;
          lessons: { id: string }[];
        };
        const lessonId = m.lessons?.[0]?.id;
        const v = lessonId ? videoBy.get(lessonId) : undefined;

        return {
          id: m.id,
          number: m.number,
          code: m.code ?? `M${String(m.number).padStart(2, "0")}`,
          isBonus: m.is_bonus,
          slug: m.slug,
          title: m.title,
          estimatedMinutes: m.estimated_minutes,
          status: (progressBy.get(m.id) ?? "not_started") as ModuleSummary["status"],
          percentageWatched: Number(v?.percentage_watched ?? 0),
          resumeAtSeconds: Number(v?.max_position_seconds ?? 0),
        };
      })
      .sort((a, b) => a.number - b.number);

    return {
      id: w.id,
      number: w.number,
      title: w.title,
      theme: w.theme,
      // A locked week exposes number, title and release date only (F3.3).
      overview: state === "locked" ? null : w.overview,
      // Defence in depth: RLS already hides these from participants, but an
      // admin's session bypasses it, and the participant view must show what a
      // participant sees. Filtering here keeps the UI honest for any role and
      // stops prev/next walking into an unreleased week.
      releaseAt: w.release_at,
      deadlineAt: w.deadline_at,
      imageUrl: (w as { image_url?: string | null }).image_url ?? null,
      state,
      modules: state === "locked" ? [] : modules,
      requiredCount: state === "locked" ? 0 : modules.filter((m) => !m.isBonus).length,
      modulesComplete: modules.filter((m) => !m.isBonus && m.status === "completed").length,
    };
  });
});

export type ModuleDetail = {
  id: string;
  number: number;
  code: string;
  isBonus: boolean;
  slug: string;
  title: string;
  summary: string | null;
  whatYouWillLearn: string[];
  estimatedMinutes: number | null;
  weekNumber: number | null;
  lessonId: string | null;
  videoRef: string | null;
  durationSeconds: number | null;
  status: ModuleSummary["status"];
  percentageWatched: number;
  resumeAtSeconds: number;
  materials: Material[];
  weekTitle: string | null;
  /** Ordered neighbours across released weeks, for prev/next navigation. */
  prev: { slug: string; code: string; title: string } | null;
  next: { slug: string; code: string; title: string } | null;
  assignment: ModuleAssignment | null;
};

export type ModuleAssignment = {
  id: string;
  title: string;
  brief: string;
  deadlineAt: string | null;
  submitted: boolean;
};

export type Material = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  url: string | null;
  isRequired: boolean;
};

/** Null when the module does not exist or its week has not released. */
export async function getModule(slug: string): Promise<ModuleDetail | null> {
  const supabase = await getSupabase();

  // Hand-typed: Supabase types are not generated until the CLI runs against a
  // live project, and nested selects otherwise widen to an error union.
  type ModuleRow = {
    id: string;
    number: number;
    code: string | null;
    is_bonus: boolean;
    slug: string;
    title: string;
    summary: string | null;
    what_you_will_learn: unknown;
    estimated_minutes: number | null;
    lessons: { id: string; video_ref: string | null; duration_seconds: number | null }[];
    week_modules: { program_weeks: { number: number } | null }[];
  };

  const { data } = await supabase
    .from("modules")
    .select(
      "id, number, code, is_bonus, slug, title, summary, what_you_will_learn, estimated_minutes, " +
        "lessons(id, video_ref, duration_seconds), week_modules(program_weeks(number))",
    )
    .eq("slug", slug)
    .maybeSingle();

  const m = data as ModuleRow | null;
  if (!m) return null;

  const lesson = m.lessons?.[0];
  const weekLink = m.week_modules?.[0];

  const [{ data: mp }, { data: vp }, { data: materials }, { data: assignmentRow }] =
    await Promise.all([
      supabase.from("module_progress").select("status").eq("module_id", m.id).maybeSingle(),
      lesson
        ? supabase
            .from("video_progress")
            .select("percentage_watched, max_position_seconds")
            .eq("lesson_id", lesson.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("learning_materials")
        .select("id, title, description, type, url, is_required")
        .eq("owner_type", "module")
        .eq("owner_id", m.id)
        .order("order"),
      supabase
        .from("assignments")
        .select("id, title, brief, deadline_at")
        .eq("module_id", m.id)
        .maybeSingle(),
    ]);

  const assignment = assignmentRow as {
    id: string;
    title: string;
    brief: string;
    deadline_at: string | null;
  } | null;

  let submitted = false;
  if (assignment) {
    const { data: sub } = await supabase
      .from("submissions")
      .select("id")
      .eq("item_type", "assignment")
      .eq("item_id", assignment.id)
      .neq("status", "draft")
      .limit(1);
    submitted = Boolean(sub?.length);
  }

  // Neighbours come from the same ordered list the week rail uses, so
  // prev/next never points into a week that has not released.
  const weeks = await getWeeks();
  const sequence = weeks.filter((w) => w.state !== "locked").flatMap((w) => w.modules);
  // An unreleased module is not viewable in the participant app, whatever the
  // viewer's role.
  const releasedSlugs = new Set(sequence.map((x) => x.slug));
  if (!releasedSlugs.has(m.slug)) return null;

  const at = sequence.findIndex((x) => x.slug === m.slug);
  const sibling = (i: number) => {
    const s2 = i >= 0 ? sequence[i] : undefined;
    return s2 ? { slug: s2.slug, code: s2.code, title: s2.title } : null;
  };

  return {
    id: m.id,
    number: m.number,
    code: m.code ?? `M${String(m.number).padStart(2, "0")}`,
    isBonus: m.is_bonus,
    slug: m.slug,
    title: m.title,
    summary: m.summary,
    whatYouWillLearn: Array.isArray(m.what_you_will_learn)
      ? (m.what_you_will_learn as string[])
      : [],
    estimatedMinutes: m.estimated_minutes,
    weekNumber: weekLink?.program_weeks?.number ?? null,
    lessonId: lesson?.id ?? null,
    videoRef: lesson?.video_ref ?? null,
    durationSeconds: lesson?.duration_seconds ?? null,
    status: (mp?.status ?? "not_started") as ModuleSummary["status"],
    percentageWatched: Number(vp?.percentage_watched ?? 0),
    resumeAtSeconds: Number(vp?.max_position_seconds ?? 0),
    weekTitle:
      weeks.find((w) => w.number === (weekLink?.program_weeks?.number ?? -1))?.title ?? null,
    prev: at > 0 ? sibling(at - 1) : null,
    next: at >= 0 && at < sequence.length - 1 ? sibling(at + 1) : null,
    assignment: assignment
      ? {
          id: assignment.id,
          title: assignment.title,
          brief: assignment.brief,
          deadlineAt: assignment.deadline_at,
          submitted,
        }
      : null,
    materials: (materials ?? []).map((x) => ({
      id: x.id,
      title: x.title,
      description: x.description,
      type: x.type,
      url: x.url,
      isRequired: x.is_required,
    })),
  };
}

export async function getWeekMaterials(weekId: string): Promise<Material[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("learning_materials")
    .select("id, title, description, type, url, is_required")
    .eq("owner_type", "week")
    .eq("owner_id", weekId)
    .order("order");

  return (data ?? []).map((x) => ({
    id: x.id,
    title: x.title,
    description: x.description,
    type: x.type,
    url: x.url,
    isRequired: x.is_required,
  }));
}

/**
 * Programme totals for the progress bar.
 *
 * The denominator is FIXED across the whole programme and comes from the
 * database, not from counting what the client can see — RLS hides modules in
 * locked weeks, so a client-side count would start at 2 and the percentage
 * would appear to fall as weeks unlock (PRD F8.4).
 */
/**
 * Programme totals for the progress bar.
 *
 * The denominator is FIXED across the whole programme and comes from the
 * database, not from counting what the client can see — RLS hides items in
 * locked weeks, so a client-side count would start small and the percentage
 * would appear to fall as weeks unlock (PRD F8.4).
 *
 * Items = required modules + required assignments + required programme tasks.
 */
export const getProgramTotals = cache(
  async (): Promise<{ totalItems: number; completedItems: number }> => {
    const supabase = await getSupabase();

    const [{ data: total }, { count: modulesDone }, { data: submitted }] = await Promise.all([
      supabase.rpc("program_item_count"),
      supabase
        .from("module_progress")
        .select("modules!inner(is_bonus)", { count: "exact", head: true })
        .eq("status", "completed")
        .eq("modules.is_bonus", false),
      supabase.from("submissions").select("item_id").neq("status", "draft"),
    ]);

    const distinctSubmitted = new Set((submitted ?? []).map((r) => r.item_id)).size;

    return {
      totalItems: Number(total ?? 0),
      completedItems: (modulesDone ?? 0) + distinctSubmitted,
    };
  },
);

/** Extra resources the team adds for everyone — not tied to a module or week. */
export async function getLibraryResources(): Promise<Material[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("learning_materials")
    .select("id, title, description, type, url, is_required")
    .eq("owner_type", "library")
    .order("order");

  return (data ?? []).map((x) => ({
    id: x.id,
    title: x.title,
    description: x.description,
    type: x.type,
    url: x.url,
    isRequired: x.is_required,
  }));
}
