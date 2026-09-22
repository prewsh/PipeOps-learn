"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getSupabase } from "@/lib/supabase/server";
import { optionalHttpUrl } from "@/lib/validation";

/** Admin mutations. Every one is audited by its RPC (PRD F13.6). */

export async function setEnrollmentStatus(
  enrollmentId: string,
  status: "active" | "paused" | "withdrawn" | "revoked",
  reason: string,
): Promise<{ error?: string }> {
  if (!reason.trim()) return { error: "A reason is required." };

  const supabase = await getSupabase();
  const { error } = await supabase.rpc("set_enrollment_status", {
    p_enrollment_id: enrollmentId,
    p_status: status,
    p_reason: reason.trim(),
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/participants");
  return {};
}

export async function setAdminNote(
  enrollmentId: string,
  note: string,
): Promise<{ error?: string }> {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("set_admin_note", {
    p_enrollment_id: enrollmentId,
    p_note: note,
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/participants/${enrollmentId}`);
  return {};
}

/** Rebuilds every derived value for the cohort. The escape hatch (§11.6). */
export async function recomputeCohort(
  cohortId: string,
): Promise<{ count?: number; error?: string }> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("recompute_cohort", { p_cohort_id: cohortId });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { count: Number(data ?? 0) };
}

export async function refreshHealth(cohortId: string): Promise<{ count?: number; error?: string }> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("refresh_cohort_health", { p_cohort_id: cohortId });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { count: Number(data ?? 0) };
}

const announcementSchema = z.object({
  title: z.string().trim().min(3, "Give it a title."),
  body: z.string().trim().min(10, "Say something."),
  linkUrl: optionalHttpUrl,
  isPinned: z.boolean().default(false),
  audienceIds: z.array(z.string()).optional(),
});

export type AnnouncementState = { error?: string; ok?: boolean };

export async function createAnnouncement(
  cohortId: string,
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  const parsed = announcementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    linkUrl: String(formData.get("linkUrl") ?? ""),
    isPinned: formData.get("isPinned") === "on",
    audienceIds: String(formData.get("audienceIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { title, body, linkUrl, isPinned, audienceIds } = parsed.data;

  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("announcements").insert({
    cohort_id: cohortId,
    title,
    body,
    link_url: linkUrl || null,
    is_pinned: isPinned,
    created_by: user?.id ?? null,
    audience:
      audienceIds && audienceIds.length > 0 ? { type: "ids", ids: audienceIds } : { type: "all" },
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/announcements");
  revalidatePath("/");
  return { ok: true };
}

export async function markAnnouncementRead(announcementId: string) {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = getAdminSupabase();
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!enrollment) return;

  await admin
    .from("announcement_reads")
    .upsert(
      { announcement_id: announcementId, enrollment_id: enrollment.id },
      { onConflict: "announcement_id,enrollment_id", ignoreDuplicates: true },
    );
}
