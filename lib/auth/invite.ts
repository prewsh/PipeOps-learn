import { env } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getSupabase } from "@/lib/supabase/server";
import { getStatelessSupabase } from "@/lib/supabase/stateless";

/**
 * The one path that gets a participant a way in.
 *
 * Deliberately NOT a "use server" module: everything exported from one of
 * those becomes an action a browser can call, and these helpers take an
 * enrolment and act on it with the service role. They are reached only from
 * the admin actions in lib/actions/, which check the caller first.
 *
 * Signup is disabled at the Auth level, so a sign-in email only works for an
 * address that already has a login account. Every send therefore makes sure
 * the account exists and is linked to the enrolment first — which is also
 * what fixes a late joiner who was enrolled without one.
 */

type Enrollment = { id: string; email: string; name: string | null; user_id: string | null };

/** The signed-in staff member, or null if the caller is not an admin. */
export async function currentAdmin(): Promise<{ actorId: string } | null> {
  const supabase = await getSupabase();
  const { data: ok } = await supabase.rpc("is_admin");
  if (!ok) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { actorId: user.id } : null;
}

/** The cohort invites go to: the most recently started active one. */
export async function activeCohort(): Promise<{ id: string; name: string } | null> {
  const { data } = await getAdminSupabase()
    .from("cohorts")
    .select("id, name")
    .eq("status", "active")
    .order("starts_on", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

/**
 * True when this build would put a localhost link in front of real people.
 * The email's link comes from the Supabase Site URL, which the app cannot
 * read — but an app that is itself running on localhost has not been
 * deployed, so a cohort-wide send from it is certainly premature.
 */
export function isUndeployed(): boolean {
  return /localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_APP_URL);
}

export async function ensureAccount(enrollment: Enrollment): Promise<{ error?: string }> {
  if (enrollment.user_id) return {};
  const admin = getAdminSupabase();

  const { data, error } = await admin.auth.admin.createUser({
    email: enrollment.email,
    email_confirm: true,
    user_metadata: enrollment.name ? { name: enrollment.name } : undefined,
  });
  if (error && !/already|registered|exists/i.test(error.message)) {
    return { error: "Their login account could not be created." };
  }

  // A new account is linked by the handle_new_user trigger. One that already
  // existed — an earlier cohort, say — is not, because the trigger only fires
  // on creation. Link by email either way.
  let userId = data?.user?.id ?? null;
  if (!userId) {
    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("email", enrollment.email)
      .maybeSingle();
    userId = existing?.id ?? null;
  }
  if (!userId) return { error: "Their login account could not be found." };

  await admin
    .from("enrollments")
    .update({ user_id: userId })
    .eq("id", enrollment.id)
    .is("user_id", null);
  return {};
}

/**
 * Which email a participant gets. "sign-in" carries the code and the link.
 * "invite" is the welcome: it carries neither, and sends them to /login to
 * request their own, so it still works when they open it days later.
 */
export type AuthEmail = "invite" | "sign-in";

/**
 * Sends a Supabase auth email — the invite or the sign-in email.
 *
 * Supabase can only email an existing account through its OTP templates, so
 * both are the same send. The templates tell them apart by the redirect: an
 * invite points at /login, a sign-in at /auth/confirm (docs/email-templates/).
 * The redirect travels with the request rather than living on the account, so
 * a failed or interrupted invite can never turn a later sign-in email into one
 * without a code.
 *
 * Through a stateless client, not the admin's session client: emailing a
 * third party must not be able to disturb the cookies of the person doing it.
 */
export async function sendAuthEmail(email: string, kind: AuthEmail): Promise<{ error?: string }> {
  const origin = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const { error } = await getStatelessSupabase().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: kind === "invite" ? `${origin}/login` : `${origin}/auth/confirm`,
    },
  });
  if (!error) return {};
  if (error.status === 429) return { error: "sent too recently — try again in a minute" };
  return { error: "the email could not be sent" };
}

/**
 * Who did what, to whom. The address is never written (AGENTS.md section 7);
 * the enrolment id is enough to find the person.
 */
export async function recordInvite(
  actorId: string,
  action: "enrollment.invite" | "auth.invite" | "auth.resend",
  enrollmentId: string,
  after?: Record<string, unknown>,
): Promise<void> {
  await getAdminSupabase()
    .from("audit_log")
    .insert({
      actor_user_id: actorId,
      action,
      target_type: "enrollment",
      target_id: enrollmentId,
      after: after ?? null,
    });
}

/**
 * Ensure the account, send the email, write the audit row.
 *
 * An invite gets the invite email. A resend is staff answering "I never got
 * my code", so it gets the sign-in email with the code in it.
 */
export async function deliverInvite(
  actorId: string,
  enrollment: Enrollment,
  action: "auth.invite" | "auth.resend" = "auth.invite",
): Promise<{ error?: string }> {
  const account = await ensureAccount(enrollment);
  if (account.error) return account;

  const sent = await sendAuthEmail(
    enrollment.email,
    action === "auth.invite" ? "invite" : "sign-in",
  );
  if (sent.error) return sent;

  await recordInvite(actorId, action, enrollment.id);
  return {};
}
