#!/usr/bin/env node
/**
 * Prototype 3 verification — cohort operations.
 *
 * Asserts the things that would quietly mislead the programme team:
 *   - health is DERIVED from activity, at every boundary of the F14 rules
 *   - recompute_progress rebuilds week_progress and is idempotent
 *   - a status change without a reason is rejected, and every change is audited
 *   - a participant cannot change status, read the audit log, or see an
 *     announcement addressed to someone else
 *
 * Usage: export $(grep -v '^#' .env.local | xargs) && node scripts/verify-p3.mjs
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { findOverflow, PHONE } from "./_overflow.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const P = "p3-participant@pipeops.io";
const Q = "p3-other@pipeops.io";
const R = "p3-admin@pipeops.io";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? passed++ : failed++;
  console.log(
    `${ok ? "✅" : "❌"} ${name}${ok ? "" : `\n     expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
}

async function signIn(email, { role } = {}) {
  const { data: cohort } = await admin.from("cohorts").select("id").eq("code", "ugc-01").single();
  await admin
    .from("enrollments")
    .upsert(
      { cohort_id: cohort.id, email, name: email.split("@")[0] },
      { onConflict: "cohort_id,email", ignoreDuplicates: true },
    );
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error && !/already|registered/i.test(error.message)) throw new Error(error.message);

  const { data: list } = await admin.auth.admin.listUsers();
  const uid = list.users.find((u) => u.email === email)?.id;
  if (role) await admin.from("users").update({ role }).eq("id", uid);

  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (sErr) throw new Error(`${email}: ${sErr.message}`);

  const { data: enr } = await admin.from("enrollments").select("id").eq("email", email).single();
  return { client, uid, enrollmentId: enr.id, cohortId: cohort.id };
}

async function cleanup() {
  const { data: list } = await admin.auth.admin.listUsers();
  for (const email of [P, Q, R]) {
    const { data: e } = await admin
      .from("enrollments")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (e)
      await admin
        .from("announcements")
        .delete()
        .contains("audience", { ids: [e.id] });
    await admin.from("enrollments").delete().eq("email", email);
    const u = list.users.find((x) => x.email === email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
  await admin.from("announcements").delete().eq("title", "P3 cohort-wide test");
  await admin.from("announcements").delete().eq("title", "P3 targeted test");
}

await cleanup();
const participant = await signIn(P);
const other = await signIn(Q);
const reviewer = await signIn(R, { role: "admin" });

// ------------------------------------------------------ health is derived --
const days = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

for (const [d, expected] of [
  [0, "active"],
  [3, "active"],
  [5, "needs_attention"],
  [8, "at_risk"],
  [20, "dormant"],
]) {
  await admin
    .from("enrollments")
    .update({ last_active_at: days(d) })
    .eq("id", participant.enrollmentId);
  const { data } = await admin.rpc("compute_health", { p_enrollment_id: participant.enrollmentId });
  check(`health at ${d} days inactive is ${expected}`, data, expected);
}

// refresh writes the derived value onto the cached column.
await admin.from("enrollments").update({ health: "active" }).eq("id", participant.enrollmentId);
await admin.rpc("refresh_cohort_health", { p_cohort_id: participant.cohortId });
const { data: refreshed } = await admin
  .from("enrollments")
  .select("health")
  .eq("id", participant.enrollmentId)
  .single();
check("refresh_cohort_health overwrites a stale cached value", refreshed.health, "dormant");

await admin
  .from("enrollments")
  .update({ last_active_at: days(0) })
  .eq("id", participant.enrollmentId);

// ------------------------------------------------- recompute rebuilds all --
await admin.from("week_progress").delete().eq("enrollment_id", participant.enrollmentId);
await admin.rpc("recompute_progress", { p_enrollment_id: participant.enrollmentId });

const { data: wp1 } = await admin
  .from("week_progress")
  .select("week_id, modules_total")
  .eq("enrollment_id", participant.enrollmentId);
const { count: cohortWeeks } = await admin
  .from("program_weeks")
  .select("*", { count: "exact", head: true })
  .eq("cohort_id", participant.cohortId);
check("recompute rebuilds week_progress for every week", wp1?.length, cohortWeeks);

await admin.rpc("recompute_progress", { p_enrollment_id: participant.enrollmentId });
const { data: wp2 } = await admin
  .from("week_progress")
  .select("week_id")
  .eq("enrollment_id", participant.enrollmentId);
check("recompute is idempotent — no duplicate rows", wp2?.length, cohortWeeks);

// ------------------------------------------------------- admin mutations --
const { error: noReason } = await reviewer.client.rpc("set_enrollment_status", {
  p_enrollment_id: participant.enrollmentId,
  p_status: "paused",
  p_reason: "   ",
});
check("a status change with no reason is REJECTED", Boolean(noReason), true);

const { error: notAllowed } = await participant.client.rpc("set_enrollment_status", {
  p_enrollment_id: other.enrollmentId,
  p_status: "revoked",
  p_reason: "malicious",
});
check("a participant CANNOT change enrolment status", Boolean(notAllowed), true);

const { error: okChange } = await reviewer.client.rpc("set_enrollment_status", {
  p_enrollment_id: participant.enrollmentId,
  p_status: "paused",
  p_reason: "Travelling, back next week",
});
check("an admin can change status with a reason", okChange, null);

const { data: audit } = await admin
  .from("audit_log")
  .select("action, target_id, after")
  .eq("target_id", participant.enrollmentId)
  .order("occurred_at", { ascending: false })
  .limit(1);
check("the status change wrote an audit row", audit?.[0]?.action, "enrollment.status");
check("the audit row records the reason", audit?.[0]?.after?.reason, "Travelling, back next week");

const { data: participantAudit } = await participant.client.from("audit_log").select("id");
check("a participant CANNOT read the audit log", participantAudit?.length, 0);

await admin
  .from("enrollments")
  .update({ status: "active", status_reason: null })
  .eq("id", participant.enrollmentId);

// -------------------------------------------------- announcement targeting --
await reviewer.client.from("announcements").insert({
  cohort_id: participant.cohortId,
  title: "P3 cohort-wide test",
  body: "Everyone should see this.",
  audience: { type: "all" },
});

await reviewer.client.from("announcements").insert({
  cohort_id: participant.cohortId,
  title: "P3 targeted test",
  body: "Only one person should see this.",
  audience: { type: "ids", ids: [other.enrollmentId] },
});

const { data: pSees } = await participant.client.from("announcements").select("title");
const pTitles = (pSees ?? []).map((a) => a.title).sort();
check("cohort-wide announcement is visible", pTitles.includes("P3 cohort-wide test"), true);
check(
  "a targeted announcement is NOT visible to others",
  pTitles.includes("P3 targeted test"),
  false,
);

const { data: qSees } = await other.client.from("announcements").select("title");
check(
  "the targeted participant DOES see it",
  (qSees ?? []).map((a) => a.title).includes("P3 targeted test"),
  true,
);

// A future-dated announcement stays hidden until its publish time.
await reviewer.client.from("announcements").insert({
  cohort_id: participant.cohortId,
  title: "P3 cohort-wide test",
  body: "Scheduled.",
  publish_at: new Date(Date.now() + 86_400_000).toISOString(),
  audience: { type: "all" },
});
const { data: pSeesLater } = await participant.client
  .from("announcements")
  .select("title")
  .eq("title", "P3 cohort-wide test");
check("a scheduled announcement is hidden until publish_at", pSeesLater?.length, 1);

// ------------------------------------------------- cohort feature flags ----
// The three launch switches. Nothing exercised them, and that gap hid a real
// bug: the shared id guard used Zod's `uuid()`, which enforces RFC 9562
// version and variant bits — and this cohort's seeded id
// (22222222-2222-2222-2222-222222222222) does not satisfy them. Every flip
// failed with "Unknown cohort" while the UI looked fine.
//
// Asserted through the RPC with a real admin session and the REAL cohort id,
// because a fabricated id would not have caught it.
const flagBefore = await admin
  .from("cohorts")
  .select("sessions_visible")
  .eq("id", reviewer.cohortId)
  .single();

const { error: flagOnErr } = await reviewer.client.rpc("set_cohort_flag", {
  p_cohort_id: reviewer.cohortId,
  p_flag: "sessions_visible",
  p_value: true,
});
check("an admin can turn a cohort flag on", flagOnErr, null);

const { data: flagOn } = await admin
  .from("cohorts")
  .select("sessions_visible")
  .eq("id", reviewer.cohortId)
  .single();
check("the flag actually persisted", flagOn.sessions_visible, true);

const { data: flagAudit } = await admin
  .from("audit_log")
  .select("action, actor_user_id")
  .eq("action", "cohort.flag")
  .order("occurred_at", { ascending: false })
  .limit(1);
check("the flip wrote an audit row naming the actor", flagAudit?.[0]?.actor_user_id, reviewer.uid);

const { error: flagAsParticipant } = await participant.client.rpc("set_cohort_flag", {
  p_cohort_id: reviewer.cohortId,
  p_flag: "sessions_visible",
  p_value: false,
});
check("a participant CANNOT flip a cohort flag", Boolean(flagAsParticipant), true);

const { error: badFlag } = await reviewer.client.rpc("set_cohort_flag", {
  p_cohort_id: reviewer.cohortId,
  p_flag: "role",
  p_value: true,
});
check("an unknown flag name is refused", Boolean(badFlag), true);

// Put the cohort back the way it was found.
await admin
  .from("cohorts")
  .update({ sessions_visible: flagBefore.data.sessions_visible })
  .eq("id", reviewer.cohortId);

// ---------------------------------------------- every admin page renders ----
// Admins read across the cohort, so a query that relies on RLS to mean "my
// rows" returns everyone's for them. That is how the participant module page
// broke — and an admin previewing the participant app hits both sets of
// routes, which is why this walks them too.
const baseUrl =
  process.env.VERIFY_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const { data: adminLink } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: R,
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(
    `${baseUrl}/auth/confirm?token_hash=${encodeURIComponent(adminLink.properties.hashed_token)}&type=magiclink`,
    { waitUntil: "networkidle" },
  );

  const { data: firstWeek } = await admin
    .from("program_weeks")
    .select("number")
    .eq("cohort_id", reviewer.cohortId)
    .order("number")
    .limit(1)
    .single();

  // A released module. This is the route that actually broke: as an admin the
  // page saw every participant's module_progress, so `.maybeSingle()` threw.
  const { data: openModule } = await admin
    .from("week_modules")
    .select("modules!inner(slug), program_weeks!inner(cohort_id, release_at)")
    .eq("program_weeks.cohort_id", reviewer.cohortId)
    .lte("program_weeks.release_at", new Date().toISOString())
    .limit(1)
    .single();

  const routes = [
    "/admin",
    "/admin/participants",
    `/admin/participants/${participant.enrollmentId}`,
    "/admin/invites",
    "/admin/submissions",
    "/admin/content",
    `/admin/content/${firstWeek.number}`,
    // The module editor now carries the assignment editor as well.
    `/admin/content/module/${openModule.modules.slug}`,
    "/admin/sessions",
    "/admin/announcements",
    // The staff account also uses the participant app.
    "/",
    "/learn",
    `/learn/module/${openModule.modules.slug}`,
    "/tasks",
  ];

  for (const path of routes) {
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
    check(`${path} renders for an admin`, response?.status(), 200);
  }

  // The same routes on a 360px phone: nothing may be wider than the screen.
  await page.setViewportSize(PHONE);
  for (const path of routes) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
    check(`${path} fits a 360px phone`, await findOverflow(page), []);
  }
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (process.env.VERIFY_KEEP !== "1") {
  await cleanup();
  console.log("cleaned up test participants");
}
process.exit(failed === 0 ? 0 : 1);
