import { activeCohort, currentAdmin, isUndeployed } from "@/lib/auth/invite";
import { unwrap } from "@/lib/data/query";
import { getAdminSupabase } from "@/lib/supabase/admin";

export type InviteActivity = {
  id: string;
  at: string;
  action: "enrollment.invite" | "auth.invite" | "auth.resend";
  participant: string;
  by: string;
};

export type InviteOverview = {
  cohortName: string;
  enrolled: number;
  signedIn: number;
  notSignedIn: number;
  withoutAccount: number;
  lastSentAt: string | null;
  recent: InviteActivity[];
  undeployed: boolean;
};

/**
 * The numbers an admin needs before pressing "invite everyone": how many
 * people that email reaches, and when invites last went out.
 *
 * "Signed in" means any recorded activity — sign-in writes last_active_at,
 * and nothing else can write it without a session.
 *
 * Read with the service role behind an explicit admin check, because the
 * activity list names staff, and staff profiles are not readable under RLS.
 */
export async function getInviteOverview(): Promise<InviteOverview | null> {
  if (!(await currentAdmin())) return null;
  const cohort = await activeCohort();
  if (!cohort) return null;

  const admin = getAdminSupabase();
  const rows = unwrap(
    await admin
      .from("enrollments")
      .select("id, name, email, user_id, last_active_at")
      .eq("cohort_id", cohort.id)
      .eq("status", "active"),
    "enrolments",
  );
  const enrollments = rows ?? [];

  const log = unwrap(
    await admin
      .from("audit_log")
      .select("id, occurred_at, action, target_id, actor_user_id")
      .in("action", ["enrollment.invite", "auth.invite", "auth.resend"])
      .order("occurred_at", { ascending: false })
      .limit(20),
    "invite activity",
  );
  const activity = log ?? [];

  const actorIds = [...new Set(activity.map((a) => a.actor_user_id).filter(Boolean))];
  const actors = actorIds.length
    ? (unwrap(await admin.from("users").select("id, name, email").in("id", actorIds), "staff") ??
      [])
    : [];
  const actorName = new Map(actors.map((u) => [u.id, u.name || u.email]));
  const participantName = new Map(enrollments.map((e) => [e.id, e.name || e.email]));

  const sends = activity.filter((a) => a.action !== "enrollment.invite");

  return {
    cohortName: cohort.name,
    enrolled: enrollments.length,
    signedIn: enrollments.filter((e) => e.last_active_at).length,
    notSignedIn: enrollments.filter((e) => !e.last_active_at).length,
    withoutAccount: enrollments.filter((e) => !e.user_id).length,
    lastSentAt: sends[0]?.occurred_at ?? null,
    recent: activity.map((a) => ({
      id: a.id,
      at: a.occurred_at,
      action: a.action as InviteActivity["action"],
      participant: participantName.get(a.target_id) ?? "A former participant",
      by: actorName.get(a.actor_user_id) ?? "Staff",
    })),
    undeployed: isUndeployed(),
  };
}
