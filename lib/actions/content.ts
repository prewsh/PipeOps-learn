"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase/server";
import { optionalHttpUrl, uuid } from "@/lib/validation";

/**
 * Content editing for the programme team (PRD F13.4).
 *
 * Scope is deliberate: edit what a cohort needs changed mid-flight — copy,
 * dates, briefs, video ids, resource links. It is not an authoring studio, and
 * `AGENTS.md` section 12 still rules that out.
 *
 * Every write is admin-gated by RLS, so these actions add validation and
 * reconciliation rather than access control.
 */

export type ContentState = { error?: string; ok?: string };

/** Dates arrive from a datetime-local input, which has no timezone. Cohort
 *  time is the only sensible reading of what an admin typed. */
function cohortTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}:00+01:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const weekSchema = z.object({
  title: z.string().trim().min(2, "Give the week a title."),
  theme: z.string().trim().max(60).optional(),
  overview: z.string().trim().max(2000).optional(),
});

export async function saveWeek(
  weekId: string,
  _prev: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const parsed = weekSchema.safeParse({
    title: formData.get("title"),
    theme: String(formData.get("theme") ?? ""),
    overview: String(formData.get("overview") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const releaseAt = cohortTime(String(formData.get("releaseAt") ?? "") || null);
  const deadlineAt = cohortTime(String(formData.get("deadlineAt") ?? "") || null);
  if (!releaseAt || !deadlineAt) return { error: "Both dates are required." };
  if (new Date(deadlineAt) <= new Date(releaseAt)) {
    return { error: "The deadline has to be after the release." };
  }

  const supabase = await getSupabase();
  const { error } = await supabase
    .from("program_weeks")
    .update({
      title: parsed.data.title,
      theme: parsed.data.theme || null,
      overview: parsed.data.overview || null,
      release_at: releaseAt,
      deadline_at: deadlineAt,
      image_url: String(formData.get("imageUrl") ?? "").trim() || null,
    })
    .eq("id", weekId);

  if (error) return { error: error.message };

  revalidatePath("/admin/content", "layout");
  revalidatePath("/", "layout");
  return { ok: "Week saved." };
}

export async function releaseWeekNow(weekId: string): Promise<ContentState> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("program_weeks")
    .update({ release_at: new Date().toISOString() })
    .eq("id", weekId);

  if (error) return { error: error.message };
  revalidatePath("/admin/content", "layout");
  revalidatePath("/", "layout");
  return { ok: "Week is now open." };
}

const moduleSchema = z.object({
  title: z.string().trim().min(2, "Give the module a title."),
  summary: z.string().trim().max(600).optional(),
  estimatedMinutes: z.coerce.number().int().min(0).max(600).optional(),
  // The 11-character YouTube id, not a URL — the player builds the embed.
  videoRef: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{11}$/, "That isn't a YouTube video id (11 characters).")
    .or(z.literal(""))
    .optional(),
});

export async function saveModule(
  moduleId: string,
  lessonId: string | null,
  _prev: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const raw = String(formData.get("videoRef") ?? "").trim();
  // Accept a pasted URL and pull the id out, rather than rejecting it.
  const videoRef = raw.replace(
    /^.*(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11}).*$/,
    "$1",
  );

  const parsed = moduleSchema.safeParse({
    title: formData.get("title"),
    summary: String(formData.get("summary") ?? ""),
    estimatedMinutes: formData.get("estimatedMinutes") || undefined,
    videoRef,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const bullets = String(formData.get("whatYouWillLearn") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const supabase = await getSupabase();
  const { error } = await supabase
    .from("modules")
    .update({
      title: parsed.data.title,
      summary: parsed.data.summary || null,
      estimated_minutes: parsed.data.estimatedMinutes ?? null,
      what_you_will_learn: bullets,
    })
    .eq("id", moduleId);

  if (error) return { error: error.message };

  if (lessonId) {
    const { error: lessonError } = await supabase
      .from("lessons")
      .update({ video_ref: parsed.data.videoRef || null })
      .eq("id", lessonId);
    if (lessonError) return { error: lessonError.message };
  }

  revalidatePath("/admin/content", "layout");
  revalidatePath("/learn", "layout");
  return { ok: "Module saved." };
}

const taskSchema = z.object({
  title: z.string().trim().min(2, "Give the task a title."),
  brief: z.string().trim().min(10, "Write a brief."),
});

export async function saveTask(
  weekId: string,
  taskId: string | null,
  _prev: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    brief: formData.get("brief"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const deadlineAt = cohortTime(String(formData.get("deadlineAt") ?? "") || null);
  const types = ["url", "text", "file"].filter((t) => formData.get(`type_${t}`) === "on");
  if (types.length === 0) return { error: "Pick at least one submission type." };

  const supabase = await getSupabase();
  const payload = {
    week_id: weekId,
    title: parsed.data.title,
    brief: parsed.data.brief,
    submission_types: types,
    deadline_at: deadlineAt,
    status: "published" as const,
  };

  const { error } = taskId
    ? await supabase.from("program_tasks").update(payload).eq("id", taskId)
    : await supabase.from("program_tasks").insert(payload);

  if (error) return { error: error.message };

  // Moving a deadline re-judges work already submitted against it (F13.5).
  if (taskId && deadlineAt) {
    await supabase.rpc("reconcile_lateness", {
      p_item_type: "program_task",
      p_item_id: taskId,
    });
  }

  revalidatePath("/admin/content", "layout");
  revalidatePath("/", "layout");
  return { ok: taskId ? "Task saved." : "Task created." };
}

const resourceSchema = z.object({
  title: z.string().trim().min(2, "Give the resource a title."),
  url: z.url("That isn't a full URL."),
  description: z.string().trim().max(300).optional(),
  type: z.enum(["pdf", "doc", "sheet", "link", "template", "video", "image"]),
});

export async function addResource(
  ownerType: "module" | "week" | "library",
  ownerId: string,
  _prev: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const parsed = resourceSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
    description: String(formData.get("description") ?? ""),
    type: formData.get("type"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const supabase = await getSupabase();
  const { error } = await supabase.from("learning_materials").insert({
    owner_type: ownerType,
    owner_id: ownerId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    type: parsed.data.type,
    url: parsed.data.url,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/content", "layout");
  revalidatePath("/", "layout");
  return { ok: "Resource added." };
}

export async function deleteResource(id: string): Promise<ContentState> {
  const supabase = await getSupabase();
  const { error } = await supabase.from("learning_materials").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/content", "layout");
  revalidatePath("/", "layout");
  return { ok: "Resource removed." };
}

export type CohortFlag = "submissions_open" | "leaderboard_visible" | "sessions_visible";

const FLAG_COPY: Record<CohortFlag, { on: string; off: string }> = {
  submissions_open: { on: "Submissions are open.", off: "Submissions are frozen." },
  leaderboard_visible: {
    on: "The leaderboard is live for participants.",
    off: "The leaderboard shows “coming soon”.",
  },
  sessions_visible: {
    on: "Sessions are live for participants.",
    off: "Sessions show “coming soon”.",
  },
};

/**
 * Cohort-level switches, through the audited RPC (F13.6).
 *
 * These go via `set_cohort_flag` rather than a direct table update so that
 * turning the leaderboard on, or freezing submissions mid-cohort, leaves a row
 * saying who did it and when. The RPC also rejects any column name that is not
 * one of these three.
 */
export async function setCohortFlag(
  cohortId: string,
  flag: CohortFlag,
  value: boolean,
): Promise<ContentState> {
  if (!uuid.safeParse(cohortId).success) return { error: "Unknown cohort." };

  const supabase = await getSupabase();
  const { error } = await supabase.rpc("set_cohort_flag", {
    p_cohort_id: cohortId,
    p_flag: flag,
    p_value: value,
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  return { ok: value ? FLAG_COPY[flag].on : FLAG_COPY[flag].off };
}

const sessionSchema = z.object({
  speakerName: z.string().trim().min(2, "Who is speaking?"),
  speakerTitle: z.string().trim().max(120).optional(),
  topic: z.string().trim().min(3, "Give the session a topic."),
  description: z.string().trim().max(1000).optional(),
  durationMinutes: z.coerce.number().int().min(10).max(480),
  joinUrl: optionalHttpUrl,
  replayUrl: optionalHttpUrl,
});

export async function saveSession(
  cohortId: string,
  sessionId: string | null,
  _prev: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const parsed = sessionSchema.safeParse({
    speakerName: formData.get("speakerName"),
    speakerTitle: String(formData.get("speakerTitle") ?? ""),
    topic: formData.get("topic"),
    description: String(formData.get("description") ?? ""),
    durationMinutes: formData.get("durationMinutes") || 60,
    joinUrl: String(formData.get("joinUrl") ?? ""),
    replayUrl: String(formData.get("replayUrl") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const startsAt = cohortTime(String(formData.get("startsAt") ?? "") || null);
  if (!startsAt) return { error: "When does it start?" };

  const supabase = await getSupabase();
  const payload = {
    cohort_id: cohortId,
    speaker_name: parsed.data.speakerName,
    speaker_title: parsed.data.speakerTitle || null,
    topic: parsed.data.topic,
    description: parsed.data.description || null,
    starts_at: startsAt,
    duration_minutes: parsed.data.durationMinutes,
    join_url: parsed.data.joinUrl || null,
    replay_url: parsed.data.replayUrl || null,
    status: "published" as const,
  };

  const { error } = sessionId
    ? await supabase.from("live_sessions").update(payload).eq("id", sessionId)
    : await supabase.from("live_sessions").insert(payload);

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  revalidatePath("/sessions");
  return { ok: sessionId ? "Session saved." : "Session scheduled." };
}

export async function deleteSession(id: string): Promise<ContentState> {
  const supabase = await getSupabase();
  const { error } = await supabase.from("live_sessions").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/sessions");
  revalidatePath("/sessions");
  return { ok: "Session removed." };
}
