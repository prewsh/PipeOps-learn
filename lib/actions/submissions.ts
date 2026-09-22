"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/actions/progress";
import { getSupabase } from "@/lib/supabase/server";
import { httpUrl, uuid } from "@/lib/validation";

/**
 * Submission writes (PRD F7).
 *
 * Lateness, versioning, idempotency, item validity, the cohort freeze and
 * every field rule live in the database RPCs, not here — they must hold
 * regardless of which client calls them. What is left in this file is the
 * usability layer: readable messages, and revalidation.
 *
 * Nothing here reads a hidden form field. `requiresUrl`, `requiresText` and
 * `textMin` used to arrive from the browser, which meant the rules they
 * expressed could be edited by the person they applied to.
 */

export type SubmitResult = { error?: string; ok?: boolean; isLate?: boolean; version?: number };

/** The RPC raises with a message written to be read. Anything unrecognised is
 *  a fault rather than a rejection, so it does not get shown verbatim. */
function readable(message: string): string {
  const known = [
    ["submissions are closed", "Submissions through the portal aren't open yet."],
    ["no such item", "That task is no longer available."],
    ["has not been released", "That task is no longer available."],
    ["link must start with", "Links must start with https://"],
    ["at most 10 links", "That's more links than this task accepts."],
    ["does not accept links", "This task doesn't take a link."],
    ["does not accept a written response", "This task doesn't take a written response."],
    ["a public link is required", "Paste the public link to your post."],
    ["must be at least", message],
    ["longer than the", message],
  ] as const;

  const hit = known.find(([needle]) => message.toLowerCase().includes(needle));
  return hit ? hit[1] : "We couldn't save that. Try again.";
}

function parseUrls(raw: FormDataEntryValue | null): { urls: string[]; error?: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { urls: [] };

  const urls = text
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);

  for (const u of urls) {
    if (!httpUrl.safeParse(u).success) {
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
): Promise<{ ok: boolean; submissionId?: string; error?: string }> {
  if (!uuid.safeParse(itemId).success) return { ok: false };

  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("save_draft", {
    p_type: itemType,
    p_item_id: itemId,
    p_urls: urls,
    p_text: text || null,
  });

  if (error) return { ok: false, error: readable(error.message) };
  return { ok: true, submissionId: (data as string) ?? undefined };
}

/**
 * Records an uploaded file against the participant's open draft and returns
 * the metadata row id.
 *
 * The id matters: the form used to key a freshly uploaded file by its storage
 * path, then pass that path to removeFile, which deletes by row id. Removing a
 * file you had just added silently did nothing until the page was reloaded.
 */
export async function attachFile(
  submissionId: string,
  file: { storagePath: string; filename: string; mimeType: string; sizeBytes: number },
): Promise<{ id?: string; error?: string }> {
  if (!uuid.safeParse(submissionId).success) return { error: "Unknown draft." };

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("submission_files")
    .insert({
      submission_id: submissionId,
      storage_path: file.storagePath,
      filename: file.filename,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
    })
    .select("id")
    .single();

  if (error) {
    // The object is already in the bucket. Without this it would sit there
    // forever, owned by no row and reachable by nothing.
    await supabase.storage.from("submissions").remove([file.storagePath]);
    return { error: error.message };
  }
  return { id: data.id };
}

/** Removes both halves: the metadata row and the object it points at. */
export async function removeFile(fileId: string): Promise<{ error?: string }> {
  if (!uuid.safeParse(fileId).success) return { error: "Unknown file." };

  const supabase = await getSupabase();
  const { data: file } = await supabase
    .from("submission_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();

  const { error } = await supabase.from("submission_files").delete().eq("id", fileId);
  if (error) return { error: error.message };

  if (file?.storage_path) {
    await supabase.storage.from("submissions").remove([file.storage_path]);
  }
  return {};
}

export async function submitWork(
  itemType: "assignment" | "program_task",
  itemId: string,
  _prev: SubmitResult,
  formData: FormData,
): Promise<SubmitResult> {
  if (!uuid.safeParse(itemId).success) return { error: "That task is no longer available." };

  const { urls, error: urlError } = parseUrls(formData.get("urls"));
  if (urlError) return { error: urlError };

  const text = String(formData.get("text") ?? "").trim();

  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("submit_work", {
    p_type: itemType,
    p_item_id: itemId,
    p_urls: urls,
    p_text: text || null,
  });

  if (error) return { error: readable(error.message) };

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
  if (!uuid.safeParse(submissionId).success) return { error: "Unknown submission." };

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
