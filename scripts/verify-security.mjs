#!/usr/bin/env node
/**
 * Security verification — adversarial, against the live project.
 *
 * Every check here is an ATTACK, not a feature test. Two real participants and
 * an admin, driving PostgREST directly with valid sessions — the way an
 * attacker would, bypassing the UI entirely.
 *
 * Usage: export $(grep -v '^#' .env.local | xargs) && node scripts/verify-security.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const A = "sec-alpha@pipeops.io";
const B = "sec-beta@pipeops.io";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const FIXTURE_TASK_TITLE = "__verify_sec_fixture_task";

/** The suite owns its own task fixture rather than depending on seeded
 *  content, which the programme team edits and deletes freely. */
async function ensureTaskFixture() {
  const { data: fixtureCohort } = await admin
    .from("cohorts")
    .select("id")
    .eq("code", "ugc-01")
    .single();

  const { data: week } = await admin
    .from("program_weeks")
    .select("id, deadline_at")
    .eq("cohort_id", fixtureCohort.id)
    .lte("release_at", new Date().toISOString())
    .order("number")
    .limit(1)
    .single();

  const { data: existing } = await admin
    .from("program_tasks")
    .select("id, deadline_at")
    .eq("title", FIXTURE_TASK_TITLE)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await admin
    .from("program_tasks")
    .insert({
      week_id: week.id,
      title: FIXTURE_TASK_TITLE,
      brief: "Fixture task created by the verification suite.",
      submission_types: ["url", "text"],
      deadline_at: week.deadline_at,
      is_required: true,
    })
    .select("id, deadline_at")
    .single();
  if (error) throw new Error(`task fixture: ${error.message}`);
  return data;
}

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? passed++ : failed++;
  console.log(
    `${ok ? "✅" : "🚨"} ${name}${ok ? "" : `\n     expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
}

async function signIn(email) {
  const { data: cohort } = await admin.from("cohorts").select("id").eq("code", "ugc-01").single();
  await admin
    .from("enrollments")
    .upsert(
      { cohort_id: cohort.id, email, name: email.split("@")[0] },
      { onConflict: "cohort_id,email", ignoreDuplicates: true },
    );
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error && !/already|registered/i.test(error.message)) throw new Error(error.message);

  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });

  const { data: list } = await admin.auth.admin.listUsers();
  const uid = list.users.find((u) => u.email === email)?.id;
  const { data: enr } = await admin.from("enrollments").select("id").eq("email", email).single();
  return { client, uid, enrollmentId: enr.id, cohortId: cohort.id };
}

async function cleanup() {
  const { data: list } = await admin.auth.admin.listUsers();
  for (const email of [A, B]) {
    await admin.from("enrollments").delete().eq("email", email);
    const u = list.users.find((x) => x.email === email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
}

await cleanup();
const alpha = await signIn(A);
const beta = await signIn(B);

console.log("\n── privilege escalation ──────────────────────────────────────");

// The single most dangerous thing a participant could do.
await alpha.client.from("users").update({ role: "admin" }).eq("id", alpha.uid);
const { data: roleAfter } = await admin.from("users").select("role").eq("id", alpha.uid).single();
check("a participant CANNOT promote themselves to admin", roleAfter.role, "participant");

const { data: isAdminAfter } = await alpha.client.rpc("is_admin");
check("is_admin() still reports false for them", isAdminAfter, false);

// Enrolment status is the access gate; participants must not touch it.
await alpha.client.from("enrollments").update({ status: "active" }).eq("id", beta.enrollmentId);
const { data: betaEnr } = await admin
  .from("enrollments")
  .select("status")
  .eq("id", beta.enrollmentId)
  .single();
check("a participant cannot alter another's enrolment", betaEnr.status, "active");

// Points are server-written only. Awarding yourself must fail.
const { error: pointsErr } = await alpha.client.from("points_events").insert({
  enrollment_id: alpha.enrollmentId,
  rule: "MODULE_COMPLETED",
  target_type: "module",
  target_id: alpha.enrollmentId,
  points: 99999,
});
check("a participant CANNOT award themselves points", Boolean(pointsErr), true);

await alpha.client.from("enrollments").update({ points_total: 99999 }).eq("id", alpha.enrollmentId);
const { data: cachedPoints } = await admin
  .from("enrollments")
  .select("points_total")
  .eq("id", alpha.enrollmentId)
  .single();
check("a participant cannot inflate their cached points", cachedPoints.points_total, 0);

const { error: activityErr } = await alpha.client
  .from("activity_events")
  .insert({ enrollment_id: alpha.enrollmentId, type: "FORGED" });
check("a participant CANNOT forge activity events", Boolean(activityErr), true);

console.log("\n── cross-participant reads ───────────────────────────────────");

// Give beta something worth stealing.
await ensureTaskFixture();
const { data: task } = await beta.client
  .from("program_tasks")
  .select("id")
  .eq("title", FIXTURE_TASK_TITLE)
  .single();
await admin.from("submissions").insert({
  enrollment_id: beta.enrollmentId,
  item_type: "program_task",
  item_id: task.id,
  version: 1,
  status: "submitted",
  urls: ["https://linkedin.com/posts/beta-private"],
  text_response: "beta private text",
  submitted_at: new Date().toISOString(),
});

const { data: stolenSubs } = await alpha.client.from("submissions").select("id, text_response");
check("cannot read another participant's submissions", stolenSubs?.length, 0);

const { data: stolenProgress } = await alpha.client
  .from("module_progress")
  .select("id")
  .eq("enrollment_id", beta.enrollmentId);
check("cannot read another participant's module progress", stolenProgress?.length, 0);

const { data: stolenVideo } = await alpha.client
  .from("video_progress")
  .select("id")
  .eq("enrollment_id", beta.enrollmentId);
check("cannot read another participant's video progress", stolenVideo?.length, 0);

const { data: stolenPoints } = await alpha.client
  .from("points_events")
  .select("id")
  .eq("enrollment_id", beta.enrollmentId);
check("cannot read another participant's points ledger", stolenPoints?.length, 0);

const { data: stolenActivity } = await alpha.client
  .from("activity_events")
  .select("id")
  .eq("enrollment_id", beta.enrollmentId);
check("cannot read another participant's activity", stolenActivity?.length, 0);

const { data: stolenEmails } = await alpha.client.from("enrollments").select("email");
check("cannot enumerate other participants' emails", stolenEmails?.length, 1);

const { data: stolenUsers } = await alpha.client.from("users").select("id, email");
check("cannot enumerate the users table", stolenUsers?.length, 1);

const { data: audit } = await alpha.client.from("audit_log").select("id");
check("cannot read the audit log", audit?.length, 0);

console.log("\n── leaderboard leaks nothing extra ───────────────────────────");

const { data: board } = await alpha.client.rpc("leaderboard", { p_limit: 25 });
const boardKeys = board?.[0] ? Object.keys(board[0]).sort() : [];
check("the board exposes only name, points, streak, weeks and rank", boardKeys, [
  "display_name",
  "enrollment_id",
  "is_me",
  "points_total",
  "rank",
  "streak_weeks",
  "weeks_completed",
]);
check("no email appears anywhere on the board", JSON.stringify(board ?? []).includes("@"), false);

console.log("\n── write attempts on someone else's rows ─────────────────────");

const { data: betaSub } = await admin
  .from("submissions")
  .select("id")
  .eq("enrollment_id", beta.enrollmentId)
  .single();

await alpha.client.from("submissions").update({ status: "approved" }).eq("id", betaSub.id);
const { data: afterTamper } = await admin
  .from("submissions")
  .select("status")
  .eq("id", betaSub.id)
  .single();
check("cannot approve another participant's submission", afterTamper.status, "submitted");

const { error: reviewErr } = await alpha.client.rpc("review_submission", {
  p_submission_id: betaSub.id,
  p_status: "approved",
  p_note: null,
});
check("cannot call review_submission as a participant", Boolean(reviewErr), true);

const { error: recomputeErr } = await alpha.client.rpc("recompute_cohort", {
  p_cohort_id: alpha.cohortId,
});
check("cannot run a cohort-wide recompute", Boolean(recomputeErr), true);

const { error: statusErr } = await alpha.client.rpc("set_enrollment_status", {
  p_enrollment_id: beta.enrollmentId,
  p_status: "revoked",
  p_reason: "attack",
});
check("cannot change enrolment status", Boolean(statusErr), true);

const { error: announceErr } = await alpha.client.from("announcements").insert({
  cohort_id: alpha.cohortId,
  title: "forged",
  body: "forged announcement",
});
check("cannot post an announcement", Boolean(announceErr), true);

// Writing progress for someone else must be refused by the WITH CHECK clause.
const { error: foreignProgress } = await alpha.client
  .from("module_progress")
  .insert({ enrollment_id: beta.enrollmentId, module_id: task.id, status: "completed" });
check("cannot write progress onto another enrolment", Boolean(foreignProgress), true);

console.log("\n── forged submissions cannot mint points ─────────────────────");

// submissions.item_id is polymorphic and carries no foreign key. Before the
// integrity migration, submit_work took any UUID and recompute_points paid out
// for it. This is that attack, run for real.
const ghost = "00000000-dead-4000-8000-00000000beef";

const { data: pointsBefore } = await admin
  .from("enrollments")
  .select("points_total")
  .eq("id", alpha.enrollmentId)
  .single();

const { error: ghostDraft } = await alpha.client.rpc("save_draft", {
  p_type: "program_task",
  p_item_id: ghost,
  p_urls: ["https://example.com/nothing"],
  p_text: "there is no such task",
});
check("save_draft refuses an item that does not exist", Boolean(ghostDraft), true);

const { error: ghostSubmit } = await alpha.client.rpc("submit_work", {
  p_type: "program_task",
  p_item_id: ghost,
  p_urls: ["https://example.com/nothing"],
  p_text: "there is no such task",
});
check("submit_work refuses an item that does not exist", Boolean(ghostSubmit), true);

const { count: ghostRows } = await admin
  .from("submissions")
  .select("*", { count: "exact", head: true })
  .eq("item_id", ghost);
check("no submission row exists for the fabricated item", ghostRows, 0);

await admin.rpc("recompute_points", { p_enrollment_id: alpha.enrollmentId });
const { data: pointsAfter } = await admin
  .from("enrollments")
  .select("points_total")
  .eq("id", alpha.enrollmentId)
  .single();
check(
  "a fabricated item earns no points",
  Number(pointsAfter.points_total),
  Number(pointsBefore.points_total),
);

// The same attack from the other direction: a forged row already in the table
// (as a pre-fix exploit would have left) must not be paid out on recompute,
// and the ledger must stay append-only while that is corrected.
const { data: forged } = await admin
  .from("submissions")
  .insert({
    enrollment_id: alpha.enrollmentId,
    item_type: "program_task",
    item_id: ghost,
    status: "submitted",
    submitted_at: new Date().toISOString(),
    urls: ["https://example.com/nothing"],
  })
  .select("id")
  .single();

await admin.rpc("recompute_points", { p_enrollment_id: alpha.enrollmentId });
const { data: ghostAward } = await admin
  .from("points_events")
  .select("id")
  .eq("enrollment_id", alpha.enrollmentId)
  .eq("target_id", ghost);
check("a forged submission row earns no ledger entry", ghostAward?.length, 0);
await admin.from("submissions").delete().eq("id", forged.id);

// Release state and publish state are part of the same gate.
const { data: lockedWeek } = await admin
  .from("program_weeks")
  .select("id")
  .gt("release_at", new Date().toISOString())
  .order("number")
  .limit(1)
  .single();

const { data: lockedTask } = await admin
  .from("program_tasks")
  .insert({
    week_id: lockedWeek.id,
    title: "__verify_sec_locked_task",
    brief: "Fixture in an unreleased week.",
    submission_types: ["url"],
  })
  .select("id")
  .single();

const { error: lockedErr } = await alpha.client.rpc("submit_work", {
  p_type: "program_task",
  p_item_id: lockedTask.id,
  p_urls: ["https://example.com/early"],
});
check("submitting to an unreleased week is refused", Boolean(lockedErr), true);

const { data: draftTask } = await admin
  .from("program_tasks")
  .insert({
    week_id: task.week_id ?? lockedWeek.id,
    title: "__verify_sec_unpublished_task",
    brief: "Fixture that is not published.",
    submission_types: ["url"],
    status: "draft",
  })
  .select("id")
  .single();

const { error: unpublishedErr } = await alpha.client.rpc("submit_work", {
  p_type: "program_task",
  p_item_id: draftTask.id,
  p_urls: ["https://example.com/unpublished"],
});
check("submitting to an unpublished item is refused", Boolean(unpublishedErr), true);

await admin
  .from("program_tasks")
  .delete()
  .in("title", ["__verify_sec_locked_task", "__verify_sec_unpublished_task"]);

// z.url() accepts javascript: and data:. These links are rendered as anchors
// in the review queue, so the protocol is checked where it cannot be skipped.
for (const bad of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"]) {
  const { error } = await alpha.client.rpc("submit_work", {
    p_type: "program_task",
    p_item_id: task.id,
    p_urls: [bad],
  });
  check(`a ${bad.split(":")[0]}: link is refused`, Boolean(error), true);
}

console.log("\n── function privileges ───────────────────────────────────────");

// SECURITY DEFINER functions run as the owner. A grant is not an authorisation
// check, so each one that accepts an enrolment id must verify ownership.
for (const fn of ["compute_health", "compute_streak", "recompute_points", "recompute_progress"]) {
  const { error } = await alpha.client.rpc(fn, { p_enrollment_id: beta.enrollmentId });
  check(`${fn}() refuses another participant's enrolment`, Boolean(error), true);
}

const { error: ownHealth } = await alpha.client.rpc("compute_health", {
  p_enrollment_id: alpha.enrollmentId,
});
check("compute_health() still works on your own enrolment", ownHealth, null);

// Internal helpers must not be reachable from a browser at all. Each probe
// passes the REAL signature — calling with the wrong arguments would error for
// the wrong reason and pass this check while the function stayed exposed.
const internals = [
  ["submissions_are_open", {}],
  ["scorable_submissions", { p_enrollment_id: alpha.enrollmentId }],
  ["work_item_for_caller", { p_type: "program_task", p_item_id: task.id }],
  ["is_safe_url", { p_url: "https://example.com" }],
  ["assert_safe_urls", { p_urls: [] }],
  ["points_for", { p_rule: "MODULE_COMPLETED" }],
];
for (const [fn, args] of internals) {
  const { error } = await alpha.client.rpc(fn, args);
  check(`${fn}() is not callable by a participant`, Boolean(error), true);
}

console.log("\n── progress cannot be forged ─────────────────────────────────");

const { data: lockedModule } = await admin
  .from("week_modules")
  .select("module_id, program_weeks!inner(release_at)")
  .gt("program_weeks.release_at", new Date().toISOString())
  .limit(1)
  .single();

const { error: lockedComplete } = await alpha.client.rpc("complete_module", {
  p_module_id: lockedModule.module_id,
  p_via: "manual",
});
check("cannot manually complete an unreleased module", Boolean(lockedComplete), true);

const { data: lockedLesson } = await admin
  .from("lessons")
  .select("id")
  .eq("module_id", lockedModule.module_id)
  .limit(1)
  .maybeSingle();

if (lockedLesson) {
  const { error: lockedWatch } = await alpha.client.rpc("record_video_progress", {
    p_lesson_id: lockedLesson.id,
    p_position_seconds: 700,
    p_delta_seconds: 700,
    p_duration_seconds: 720,
    p_ended: true,
  });
  check("cannot bank video progress against an unreleased lesson", Boolean(lockedWatch), true);
}

// The headline forgery: claim the whole video in one call and take the points.
const { data: openLesson } = await alpha.client.from("lessons").select("id").limit(1).single();
await admin
  .from("video_progress")
  .delete()
  .eq("enrollment_id", alpha.enrollmentId)
  .eq("lesson_id", openLesson.id);

await alpha.client.rpc("record_video_progress", {
  p_lesson_id: openLesson.id,
  p_position_seconds: 3600,
  p_delta_seconds: 3600,
  p_duration_seconds: 1,
  p_ended: true,
});
const { data: forgedWatch } = await admin
  .from("video_progress")
  .select("watched_seconds, completed_at")
  .eq("enrollment_id", alpha.enrollmentId)
  .eq("lesson_id", openLesson.id)
  .single();
check(
  "an hour of watch time cannot be claimed in one second",
  forgedWatch.watched_seconds <= 20,
  true,
);
check("a single forged call does not complete the video", forgedWatch.completed_at, null);

console.log("\n── unauthenticated route protection ──────────────────────────");

for (const path of [
  "/",
  "/learn",
  "/tasks",
  "/leaderboard",
  "/sessions",
  "/settings",
  "/resources",
  "/announcements",
  "/admin",
  "/admin/participants",
  "/admin/submissions",
]) {
  const res = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  const blocked = res.status >= 300 && res.status < 400 && /\/login/.test(location);
  check(`unauthenticated ${path} is redirected to sign-in`, blocked, true);
}

const exportRes = await fetch(`${baseUrl}/admin/participants/export`, { redirect: "manual" });
check(
  "unauthenticated CSV export does not return data",
  exportRes.status === 200 && (exportRes.headers.get("content-type") ?? "").includes("csv"),
  false,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (process.env.VERIFY_KEEP !== "1") {
  await cleanup();
  await admin.from("program_tasks").delete().eq("title", FIXTURE_TASK_TITLE);
  console.log("cleaned up test participants");
}
process.exit(failed === 0 ? 0 : 1);
