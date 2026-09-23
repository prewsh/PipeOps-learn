"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  activeCohort,
  currentAdmin,
  deliverInvite,
  ensureAccount,
  isUndeployed,
  recordInvite,
  sendSignInEmail,
} from "@/lib/auth/invite";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { uuid } from "@/lib/validation";

/**
 * Inviting people in (admin only).
 *
 * Two entry points: add one participant, or email the whole cohort. Both go
 * through deliverInvite(), so a participant is never emailed without a login
 * account to sign in to.
 */

export type InviteState = { ok?: string; error?: string };

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Add their name.").max(120),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
});

export async function inviteParticipant(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const staff = await currentAdmin();
  if (!staff) return { error: "Not authorised." };

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { name, email } = parsed.data;
  const sendNow = formData.get("sendNow") === "on";

  const cohort = await activeCohort();
  if (!cohort) return { error: "There is no active cohort to invite them to." };

  const admin = getAdminSupabase();
  const { data: existing } = await admin
    .from("enrollments")
    .select("id, email, name, user_id, status")
    .eq("cohort_id", cohort.id)
    .eq("email", email)
    .maybeSingle();

  // An existing place is never silently reopened: a revoked or withdrawn
  // participant comes back through a status change, which requires a reason.
  if (existing && existing.status !== "active") {
    return {
      error: `They're already in ${cohort.name} with status "${existing.status}". Reactivate them from their participant page.`,
    };
  }

  let enrollment = existing;
  if (!enrollment) {
    const { data: created, error } = await admin
      .from("enrollments")
      .insert({ cohort_id: cohort.id, email, name })
      .select("id, email, name, user_id, status")
      .single();
    if (error || !created) return { error: "They couldn't be added. Try again." };
    enrollment = created;
    await recordInvite(staff.actorId, "enrollment.invite", enrollment.id, { name });
    // Initialise their derived state (progress, health) the sanctioned way.
    await admin.rpc("recompute_progress", { p_enrollment_id: enrollment.id });
  }

  const account = await ensureAccount(enrollment);
  if (account.error) return { error: `Added, but ${account.error.toLowerCase()}` };

  revalidatePath("/admin/participants");
  revalidatePath("/admin/invites");

  const added = existing
    ? `${name} is already in ${cohort.name}.`
    : `Added ${name} to ${cohort.name}.`;
  if (!sendNow) return { ok: `${added} No email sent yet.` };

  const sent = await sendSignInEmail(email);
  if (sent.error) return { error: `${added} But the email wasn't sent: ${sent.error}.` };
  await recordInvite(staff.actorId, "auth.invite", enrollment.id);
  return { ok: `${added} Their sign-in email is on its way.` };
}

/** Everyone in the cohort who has never signed in — the people an invite is for. */
export async function getInviteTargets(): Promise<{ ids: string[]; error?: string }> {
  const staff = await currentAdmin();
  if (!staff) return { ids: [], error: "Not authorised." };
  if (isUndeployed()) {
    return {
      ids: [],
      error: "Deploy first — invites from a local build would send localhost links.",
    };
  }

  const cohort = await activeCohort();
  if (!cohort) return { ids: [], error: "There is no active cohort." };

  const { data } = await getAdminSupabase()
    .from("enrollments")
    .select("id")
    .eq("cohort_id", cohort.id)
    .eq("status", "active")
    .is("last_active_at", null)
    .order("enrolled_at");
  return { ids: (data ?? []).map((r) => r.id) };
}

export type BatchResult = { sent: number; skipped: number; failed: number; errors: string[] };

const BATCH_MAX = 10;
// Spacing between sends. The SMTP relay and Supabase both throttle bursts;
// ten emails over three seconds stays well inside either.
const SEND_GAP_MS = 300;

/**
 * Sends one batch. The client walks the whole list in batches of ten so the
 * admin sees progress, and so no single request runs long enough to time out
 * halfway through the cohort with nobody knowing who got an email.
 */
export async function sendInviteBatch(ids: string[]): Promise<BatchResult> {
  const result: BatchResult = { sent: 0, skipped: 0, failed: 0, errors: [] };

  const staff = await currentAdmin();
  if (!staff) return { ...result, failed: ids.length, errors: ["Not authorised."] };
  if (isUndeployed()) {
    return { ...result, failed: ids.length, errors: ["Deploy first — this is a local build."] };
  }

  const valid = ids.slice(0, BATCH_MAX).filter((id) => uuid.safeParse(id).success);
  if (valid.length === 0) return result;

  const cohort = await activeCohort();
  if (!cohort) return { ...result, failed: valid.length, errors: ["There is no active cohort."] };

  const admin = getAdminSupabase();
  const { data: rows } = await admin
    .from("enrollments")
    .select("id, email, name, user_id, status, last_active_at")
    .eq("cohort_id", cohort.id)
    .in("id", valid);

  // A second press of the button within ten minutes must not email everyone
  // twice. Anyone sent an invite that recently is skipped, not re-sent.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: recent } = await admin
    .from("audit_log")
    .select("target_id")
    .in("action", ["auth.invite", "auth.resend"])
    .in("target_id", valid)
    .gte("occurred_at", since);
  const recentlySent = new Set((recent ?? []).map((r) => r.target_id));

  for (const [i, e] of (rows ?? []).entries()) {
    // Signed in since the list was built, withdrawn, or already emailed.
    if (e.status !== "active" || e.last_active_at || recentlySent.has(e.id)) {
      result.skipped += 1;
      continue;
    }
    const delivered = await deliverInvite(staff.actorId, e, "auth.invite");
    if (delivered.error) {
      result.failed += 1;
      if (!result.errors.includes(delivered.error)) result.errors.push(delivered.error);
    } else {
      result.sent += 1;
    }
    if (i < (rows?.length ?? 0) - 1) await new Promise((r) => setTimeout(r, SEND_GAP_MS));
  }

  revalidatePath("/admin/invites");
  return result;
}
