"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/actions/progress";
import { getMe } from "@/lib/data/program";
import { getSupabase } from "@/lib/supabase/server";

/**
 * Submission writes (PRD F7).
 *
 * Lateness, versioning and idempotency all live in the database RPCs, not
 * here — they must hold regardless of which client calls them.
 */

const urlSchema = z.url().max(2000);

export type SubmitResult = { error?: string; ok?: boolean; isLate?: boolean; version?: number };

function parseUrls(raw: FormDataEntryValue | null): { urls: string[]; error?: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { urls: [] };

  const urls = text
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);

  for (const u of urls) {
    if (!urlSchema.safeParse(u).success) {
      return { urls: [], error: `"${u}" is not a full URL. It must start with https://` };
    }
  }
  return { urls };
}

/** Autosave. A draft is not a submission — this never sets submitted_at. */
export async function saveDraft(
  itemType: "assignment" | "program_task",
  itemId: string,
  urls: string[],
  text: string,
): Promise<{ ok: boolean; submissionId?: string }> {
  const me = await getMe();
  if (!me?.submissionsOpen) return { ok: false };

  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("save_draft", {
    p_type: itemType,
    p_item_id: itemId,
    p_urls: urls,
    p_text: text || null,
  });
  return { ok: !error, submissionId: (data as string) ?? undefined };
}

/** Records an uploaded file against the participant's open draft. */
export async function attachFile(
  submissionId: string,
  file: { storagePath: string; filename: string; mimeType: string; sizeBytes: number },
): Promise<{ error?: string }> {
  const supabase = await getSupabase();
  const { error } = await supabase.from("submission_files").insert({
    submission_id: submissionId,
    storage_path: file.storagePath,
    filename: file.filename,
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes,
  });
  return error ? { error: error.message } : {};
}

export async function removeFile(fileId: string): Promise<{ error?: string }> {
  const supabase = await getSupabase();
  const { error } = await supabase.from("submission_files").delete().eq("id", fileId);
  return error ? { error: error.message } : {};
}

export async function submitWork(
  itemType: "assignment" | "program_task",
  itemId: string,
  _prev: SubmitResult,
  formData: FormData,
): Promise<SubmitResult> {
  const { urls, error: urlError } = parseUrls(formData.get("urls"));
  if (urlError) return { error: urlError };

  // A freeze has to refuse here, not merely hide the form — otherwise a
  // crafted request still writes.
  const me = await getMe();
  if (!me?.submissionsOpen) {
    return { error: "Submissions through the portal aren't open yet." };
  }

  const text = String(formData.get("text") ?? "").trim();
  const min = Number(formData.get("textMin") ?? 0);
  const requiresText = formData.get("requiresText") === "1";
  const requiresUrl = formData.get("requiresUrl") === "1";

  if (requiresUrl && urls.length === 0) {
    return { error: "Paste the public link to your post." };
  }
  if (requiresText && text.length < min) {
    return { error: `Your response needs at least ${min} characters. It has ${text.length}.` };
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("submit_work", {
    p_type: itemType,
    p_item_id: itemId,
    p_urls: urls,
    p_text: text || null,
  });

  if (error) return { error: "We couldn't save that. Try again." };

  const row = Array.isArray(data) ? data[0] : data;

  await logActivity(itemType === "assignment" ? "ASSIGNMENT_SUBMITTED" : "TASK_SUBMITTED", itemId, {
    version: row?.version,
    late: row?.is_late,
  });

  revalidatePath("/", "layout");
  revalidatePath(`/tasks/${itemId}`);

  return { ok: true, isLate: Boolean(row?.is_late), version: row?.version };
}

/** Reviewer action. The RPC rejects anyone who is not admin/reviewer. */
export async function reviewSubmission(
  submissionId: string,
  status: "approved" | "needs_revision" | "under_review",
  note: string | null,
): Promise<{ error?: string }> {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("review_submission", {
    p_submission_id: submissionId,
    p_status: status,
    p_note: note,
  });

  if (error) return { error: error.message };

  await logActivity("SUBMISSION_REVIEWED", submissionId, { status });
  revalidatePath("/admin/submissions");
  return {};
}

/** Short-lived signed URL. Files are never served from a public bucket path. */
export async function signFile(storagePath: string): Promise<string | null> {
  const supabase = await getSupabase();
  const { data } = await supabase.storage.from("submissions").createSignedUrl(storagePath, 900);
  return data?.signedUrl ?? null;
}
