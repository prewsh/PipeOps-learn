import { cache } from "react";
import { getMe } from "@/lib/data/program";
import { unwrap } from "@/lib/data/query";
import { getSupabase } from "@/lib/supabase/server";

/**
 * Weekly tasks — the work the programme team sets for a week.
 *
 * Module assignments are deliberately NOT here. An assignment belongs to its
 * video and appears on that module's page; the Weekly task section shows only
 * what an admin has set. Both use the same submission engine, so `WorkItem`
 * still describes either, but the two are never mixed into one list.
 */

export type SubmissionType = "url" | "text" | "file";

export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "needs_revision";

export type Submission = {
  id: string;
  version: number;
  status: SubmissionStatus;
  isLate: boolean;
  urls: string[];
  textResponse: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  files: { id: string; filename: string; storagePath: string; sizeBytes: number | null }[];
};

export type WorkItem = {
  id: string;
  type: "assignment" | "program_task";
  title: string;
  brief: string;
  submissionTypes: SubmissionType[];
  allowedPlatforms: string[];
  textMin: number | null;
  textMax: number | null;
  maxFiles: number;
  fileExtensions: string[];
  isRequired: boolean;
  points: number;
  deadlineAt: string | null;
  weekNumber: number | null;
  weekTitle: string | null;
  moduleTitle: string | null;
  isFinalProject: boolean;
  /**
   * Set when the task is submitted somewhere other than the portal — for now,
   * a Discord channel. The platform cannot see those submissions, so the task
   * shows where to submit instead of a status it would get wrong.
   */
  externalSubmissionUrl: string | null;
  externalSubmissionNote: string | null;
  /** Latest version. Earlier versions are in `history`. */
  submission: Submission | null;
  history: Submission[];
};

type WeekRow = { number: number; title: string; deadline_at: string };

type TaskRow = {
  id: string;
  title: string;
  brief: string;
  submission_types: SubmissionType[];
  allowed_platforms: string[] | null;
  text_min: number | null;
  text_max: number | null;
  max_files: number;
  file_extensions: string[] | null;
  is_required: boolean;
  points: number;
  deadline_at: string | null;
  is_final_project: boolean;
  external_submission_url: string | null;
  external_submission_note: string | null;
  program_weeks: WeekRow;
};

type SubmissionRow = Record<string, unknown> & { item_type: string; item_id: string };

function toSubmission(row: Record<string, unknown>): Submission {
  return {
    id: row.id as string,
    version: row.version as number,
    status: row.status as SubmissionStatus,
    isLate: Boolean(row.is_late),
    urls: Array.isArray(row.urls) ? (row.urls as string[]) : [],
    textResponse: (row.text_response as string) ?? null,
    submittedAt: (row.submitted_at as string) ?? null,
    reviewedAt: (row.reviewed_at as string) ?? null,
    reviewNote: (row.review_note as string) ?? null,
    files: ((row.submission_files as Record<string, unknown>[]) ?? []).map((f) => ({
      id: f.id as string,
      filename: f.filename as string,
      storagePath: f.storage_path as string,
      sizeBytes: (f.size_bytes as number) ?? null,
    })),
  };
}

/** Weekly tasks the participant can currently see (release-gated by RLS). */
export const getWorkItems = cache(async (): Promise<WorkItem[]> => {
  const supabase = await getSupabase();
  const me = await getMe();
  if (!me) return [];

  // Both reads are scoped explicitly. RLS gives a participant only released,
  // published tasks and their own submissions — but a staff account reads
  // across the cohort, and unscoped it would see unreleased tasks and another
  // participant's submission shown as its own (AGENTS.md section 7).
  const [taskRowsRes, submissionRowsRes] = await Promise.all([
    supabase
      .from("program_tasks")
      .select(
        "id, title, brief, submission_types, allowed_platforms, text_min, text_max, max_files, " +
          "file_extensions, is_required, points, deadline_at, is_final_project, " +
          "external_submission_url, external_submission_note, " +
          "program_weeks!inner(number, title, deadline_at, release_at, cohort_id)",
      )
      .eq("status", "published")
      .eq("program_weeks.cohort_id", me.cohortId)
      .lte("program_weeks.release_at", new Date().toISOString()),
    supabase
      .from("submissions")
      .select(
        "id, item_type, item_id, version, status, is_late, urls, text_response, submitted_at, " +
          "reviewed_at, review_note, submission_files(id, filename, storage_path, size_bytes)",
      )
      .eq("enrollment_id", me.enrollmentId)
      .order("version", { ascending: false }),
  ]);
  const taskRows = unwrap(taskRowsRes, "weekly tasks");
  const submissionRows = unwrap(submissionRowsRes, "your submissions");

  const tasks = (taskRows ?? []) as unknown as TaskRow[];
  const submissions = (submissionRows ?? []) as unknown as SubmissionRow[];

  const byItem = new Map<string, Submission[]>();
  for (const row of submissions) {
    const key = `${row.item_type}:${row.item_id}`;
    byItem.set(key, [...(byItem.get(key) ?? []), toSubmission(row)]);
  }

  return tasks
    .map((t) => {
      const week = t.program_weeks;
      const versions = byItem.get(`program_task:${t.id}`) ?? [];

      return {
        id: t.id,
        type: "program_task" as const,
        title: t.title,
        brief: t.brief,
        submissionTypes: (t.submission_types as SubmissionType[]) ?? ["url"],
        allowedPlatforms: t.allowed_platforms ?? [],
        textMin: t.text_min,
        textMax: t.text_max,
        maxFiles: t.max_files,
        fileExtensions: t.file_extensions ?? [],
        isRequired: t.is_required,
        points: t.points,
        deadlineAt: t.deadline_at ?? week?.deadline_at ?? null,
        weekNumber: week?.number ?? null,
        weekTitle: week?.title ?? null,
        moduleTitle: null,
        isFinalProject: t.is_final_project,
        externalSubmissionUrl: t.external_submission_url,
        externalSubmissionNote: t.external_submission_note,
        submission: versions[0] ?? null,
        history: versions.slice(1),
      };
    })
    .sort((a, b) => (a.weekNumber ?? 99) - (b.weekNumber ?? 99));
});

export async function getWorkItem(id: string): Promise<WorkItem | null> {
  const items = await getWorkItems();
  return items.find((i) => i.id === id) ?? null;
}

/** Tasks not yet submitted, for dashboard nudges. */
export function outstanding(items: WorkItem[]): WorkItem[] {
  return items.filter((i) => i.isRequired && (!i.submission || i.submission.status === "draft"));
}

/** Where an externally submitted task goes, in a word a participant knows. */
export function externalDestination(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "discord.gg" || host.endsWith("discord.com")) return "Discord";
    return host;
  } catch {
    return "the submission link";
  }
}
