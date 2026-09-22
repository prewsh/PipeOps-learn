"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getSupabase } from "@/lib/supabase/server";
import { optionalHttpUrl, uuid } from "@/lib/validation";

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

/**
 * Resend a sign-in email to one participant (PRD F1.10).
 *
 * The single most common support request on a passwordless cohort is "I never
 * got the code" — a typo'd address, a spam folder, an expired link. Without
 * this the only remedy is a database query and a hand-built link.
 *
 * The caller's admin role is checked against the database rather than assumed
 * from the route: this action sends real email, and route protection is not an
 * authorisation model. The enrolment must also still be active, so a revoked
 * participant cannot be let back in by a mis-click.
 */
export async function resendLoginLink(enrollmentId: string): Promise<{
  ok?: string;
  error?: string;
}> {
  if (!uuid.safeParse(enrollmentId).success) return { error: "Unknown participant." };

  const supabase = await getSupabase();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { error: "Not authorised." };

  const admin = getAdminSupabase();
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("email, status")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (!enrollment) return { error: "Unknown participant." };
  if (enrollment.status !== "active") {
    return { error: `That enrolment is ${enrollment.status}. Reactivate it first.` };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: enrollment.email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    if (error.status === 429) return { error: error.message };
    return { error: "We couldn't send that email. Try again in a moment." };
  }

  // The address itself is never logged (AGENTS.md section 7), but who resent
  // to whom is worth keeping.
  await admin.from("audit_log").insert({
    action: "auth.resend",
    target_type: "enrollment",
    target_id: enrollmentId,
  });

  return { ok: "Sign-in email sent." };
}
