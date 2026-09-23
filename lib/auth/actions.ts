"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getSupabase } from "@/lib/supabase/server";

/**
 * Invite-only, passwordless sign-in (ADR 0002).
 *
 * The enrolment check runs BEFORE any email is sent, using the service role,
 * because an unauthenticated visitor cannot read `enrollments` under RLS. The
 * failure message must never reveal whether the address exists elsewhere in
 * the system (PRD F1.4).
 */

const emailSchema = z.email().trim().toLowerCase();

export type AuthState = { error?: string };

/**
 * The enrolment a sign-in should be judged against: the most recently started
 * eligible cohort (PRD F2.2).
 *
 * `.maybeSingle()` used to do this, which meant a participant enrolled in two
 * cohorts — the explicit case the PRD allows for — got "Something went wrong"
 * instead of a login link, because the query returned two rows. Ordering is
 * not a nicety here; it is what makes the answer defined.
 */
async function currentEnrollmentFor(email: string) {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("enrollments")
    .select("id, status, cohort_id, cohorts!inner(status, starts_on)")
    .eq("email", email)
    .in("cohorts.status", ["active", "completed"])
    .order("starts_on", { ascending: false, referencedTable: "cohorts" })
    .limit(1);

  if (error) return { data: null, error };
  return { data: data?.[0] ?? null, error: null };
}

const NOT_ENROLLED =
  "We couldn't find this email in the current PipeOps UGC Program cohort. " +
  "If you were accepted, check which address you applied with.";

export async function requestAccess(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const email = parsed.data;

  const { data: enrollment, error } = await currentEnrollmentFor(email);

  if (error) return { error: "Something went wrong. Try again in a moment." };
  if (!enrollment) return { error: NOT_ENROLLED };

  if (enrollment.status === "revoked" || enrollment.status === "withdrawn") {
    return {
      error: "Your place in this cohort is no longer active. Contact the programme team.",
    };
  }

  const supabase = await getSupabase();
  // Sends the magic link and the 6-digit code in the same email (F1.3).
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/auth/confirm`,
    },
  });

  if (otpError) {
    // Supabase enforces a short cooldown per address and its own message says
    // exactly how many seconds are left — far more useful than a generic
    // "try again", so pass it through rather than flattening it.
    if (otpError.status === 429) {
      return { error: otpError.message || "Too many requests. Wait a minute and try again." };
    }
    // Enrolled, but no login account yet. Signup is disabled, so Supabase
    // refuses to send — and "try again in a moment" would be a promise that
    // retrying can never keep. It needs the team, not another attempt.
    if (
      otpError.code === "otp_disabled" ||
      /signups? not allowed|user not found/i.test(otpError.message)
    ) {
      return {
        error:
          "You're on the list, but your account isn't set up yet. Contact the programme team and they'll send your invite.",
      };
    }
    return { error: "We couldn't send that email. Try again in a moment." };
  }

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

export async function verifyCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = emailSchema.safeParse(formData.get("email"));
  // Supabase's OTP length is project configuration (6-10 digits) and this
  // project issues 8, so do not hard-code 6 — a stricter client than the
  // server makes a valid code unenterable.
  const token = z
    .string()
    .regex(/^\d{6,10}$/, "Enter the code from your email.")
    .safeParse(String(formData.get("token") ?? "").replace(/\s+/g, ""));

  if (!email.success) return { error: "Something went wrong. Start again." };
  if (!token.success) return { error: token.error.issues[0]?.message ?? "Invalid code." };

  const supabase = await getSupabase();
  const { error } = await supabase.auth.verifyOtp({
    email: email.data,
    token: token.data,
    type: "email",
  });

  if (error) {
    return { error: "That code is wrong or has expired. Request a new one." };
  }

  await recordLogin();
  redirect("/");
}

export async function signOut() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Writes LOGIN to activity_events — server-side only, by design (F1.11). */
export async function recordLogin() {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = getAdminSupabase();
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("id, cohorts!inner(starts_on, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .in("cohorts.status", ["active", "completed"])
    .order("starts_on", { ascending: false, referencedTable: "cohorts" })
    .limit(1);
  const enrollment = enrollments?.[0] ?? null;

  await Promise.all([
    admin.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id),
    enrollment
      ? admin.from("activity_events").insert({
          enrollment_id: enrollment.id,
          user_id: user.id,
          type: "LOGIN",
        })
      : Promise.resolve(),
    enrollment
      ? admin
          .from("enrollments")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", enrollment.id)
      : Promise.resolve(),
  ]);
}
