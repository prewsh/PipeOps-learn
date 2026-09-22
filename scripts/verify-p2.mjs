#!/usr/bin/env node
/**
 * Prototype 2 verification — submissions, lateness, versioning, review.
 *
 * Deliberately not the happy path. This runs the medium-hard scenario from
 * docs/TASKBOARD.md: two real participants and a reviewer, a deadline that
 * moves under an in-flight submission, a revision round trip, and a
 * double-click. It asserts the invariants that silently corrupt data:
 *
 *   - a draft is NOT a submission
 *   - is_late is computed at submit time and FROZEN on that version
 *   - resubmission opens a new version; history is never overwritten
 *   - a participant cannot review their own work
 *   - a participant cannot see anyone else's submission
 *   - double-submit is idempotent
 *
 * Usage: export $(grep -v '^#' .env.local | xargs) && node scripts/verify-p2.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const A = "p2-alpha@pipeops.io";
const B = "p2-beta@pipeops.io";
const REVIEWER = "p2-reviewer@pipeops.io";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const FIXTURE_TASK_TITLE = "__verify_p2_fixture_task";

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
  return { client, uid, enrollmentId: enr.id };
}

async function cleanup() {
  const { data: list } = await admin.auth.admin.listUsers();
  for (const email of [A, B, REVIEWER]) {
    await admin.from("enrollments").delete().eq("email", email);
    const u = list.users.find((x) => x.email === email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
}

await cleanup();

const alpha = await signIn(A);
const beta = await signIn(B);
const reviewer = await signIn(REVIEWER, { role: "admin" });

await ensureTaskFixture();

const { data: task } = await alpha.client
  .from("program_tasks")
  .select("id, title, deadline_at")
  .eq("title", FIXTURE_TASK_TITLE)
  .single();
check("participant can see a released programme task", Boolean(task?.id), true);

// ------------------------------------------------- a draft is not a submit --
await alpha.client.rpc("save_draft", {
  p_type: "program_task",
  p_item_id: task.id,
  p_urls: ["https://linkedin.com/posts/draft"],
  p_text: "work in progress",
});

const { data: draft } = await alpha.client
  .from("submissions")
  .select("status, submitted_at, version")
  .eq("item_id", task.id)
  .single();
check("draft has status 'draft'", draft.status, "draft");
check("a draft has NO submitted_at", draft.submitted_at, null);

const { data: progAfterDraft } = await admin
  .from("enrollments")
  .select("progress_pct")
  .eq("id", alpha.enrollmentId)
  .single();
check("a draft does NOT move progress", Number(progAfterDraft.progress_pct), 0);

// -------------------------------------------- submit before the deadline ---
const { data: sub1 } = await alpha.client.rpc("submit_work", {
  p_type: "program_task",
  p_item_id: task.id,
  p_urls: ["https://linkedin.com/posts/real-one"],
  p_text: "My first developer post.",
});
const r1 = Array.isArray(sub1) ? sub1[0] : sub1;
check("submitted on time is NOT late", r1.is_late, false);
check("first submission is version 1", r1.version, 1);

const { data: progAfterSubmit } = await admin
  .from("enrollments")
  .select("progress_pct")
  .eq("id", alpha.enrollmentId)
  .single();
check("submitting DOES move progress", Number(progAfterSubmit.progress_pct) > 0, true);

// ------------------------------------------------- double-click is safe ----
const { data: dup } = await alpha.client.rpc("submit_work", {
  p_type: "program_task",
  p_item_id: task.id,
  p_urls: ["https://linkedin.com/posts/real-one"],
  p_text: "My first developer post.",
});
const rDup = Array.isArray(dup) ? dup[0] : dup;
check("double-submit returns the SAME version, not a new one", rDup.version, 1);

const { count: versionCount } = await alpha.client
  .from("submissions")
  .select("*", { count: "exact", head: true })
  .eq("item_id", task.id);
check("no duplicate row was created", versionCount, 1);

// ------------------------------- lateness is frozen on the version it hit ---
// Move the deadline into the past, then submit as a second participant.
const original = task.deadline_at;
await admin
  .from("program_tasks")
  .update({ deadline_at: new Date(Date.now() - 60_000).toISOString() })
  .eq("id", task.id);

const { data: lateSub } = await beta.client.rpc("submit_work", {
  p_type: "program_task",
  p_item_id: task.id,
  p_urls: ["https://x.com/beta/status/1"],
  p_text: "Late but done.",
});
const rLate = Array.isArray(lateSub) ? lateSub[0] : lateSub;
check("submitting after the deadline IS late", rLate.is_late, true);

// Alpha submitted before the deadline moved; their row must not change.
const { data: alphaStill } = await admin
  .from("submissions")
  .select("is_late")
  .eq("id", r1.submission_id)
  .single();
check(
  "moving the deadline does NOT retroactively flag an earlier version",
  alphaStill.is_late,
  false,
);

await admin.from("program_tasks").update({ deadline_at: original }).eq("id", task.id);

// ------------------------------------------------------- cross-participant --
const { data: betaSeesAlpha } = await beta.client
  .from("submissions")
  .select("id")
  .eq("id", r1.submission_id);
check("a participant CANNOT see another participant's submission", betaSeesAlpha?.length, 0);

const { error: selfReview } = await alpha.client.rpc("review_submission", {
  p_submission_id: r1.submission_id,
  p_status: "approved",
  p_note: null,
});
check("a participant CANNOT approve their own work", Boolean(selfReview), true);

// -------------------------------------------------- revision round trip ----
const { error: revErr } = await reviewer.client.rpc("review_submission", {
  p_submission_id: r1.submission_id,
  p_status: "needs_revision",
  p_note: "Add what you are going to post about.",
});
check("reviewer can request a revision", revErr, null);

const { data: seen } = await alpha.client
  .from("submissions")
  .select("status, review_note")
  .eq("id", r1.submission_id)
  .single();
check(
  "participant sees the reviewer's note",
  seen.review_note,
  "Add what you are going to post about.",
);

const { data: sub2 } = await alpha.client.rpc("submit_work", {
  p_type: "program_task",
  p_item_id: task.id,
  p_urls: ["https://linkedin.com/posts/real-one"],
  p_text: "My first developer post. I'll be posting about Go and infra.",
});
const r2 = Array.isArray(sub2) ? sub2[0] : sub2;
check("resubmission opens version 2", r2.version, 2);

const { data: history } = await admin
  .from("submissions")
  .select("version, status, review_note")
  .eq("enrollment_id", alpha.enrollmentId)
  .eq("item_id", task.id)
  .order("version");
check("version 1 is preserved, not overwritten", history.length, 2);
check(
  "version 1 keeps its review note",
  history[0].review_note,
  "Add what you are going to post about.",
);

await reviewer.client.rpc("review_submission", {
  p_submission_id: r2.submission_id,
  p_status: "approved",
  p_note: null,
});
const { data: finalRow } = await alpha.client
  .from("submissions")
  .select("status")
  .eq("id", r2.submission_id)
  .single();
check("version 2 is approved", finalRow.status, "approved");

// --------------------------------------------- denominator includes work ---
const { data: itemCount } = await alpha.client.rpc("program_item_count");

// Derived from the schedule, so adding a week or an assignment does not fail
// this without a behaviour change.
const { data: cohortRow } = await admin.from("cohorts").select("id").eq("code", "ugc-01").single();
const [{ count: moduleCount }, { count: taskCount }] = await Promise.all([
  admin
    .from("week_modules")
    .select("modules!inner(is_bonus), program_weeks!inner(cohort_id)", {
      count: "exact",
      head: true,
    })
    .eq("program_weeks.cohort_id", cohortRow.id)
    .eq("modules.is_bonus", false),
  admin
    .from("program_tasks")
    .select("program_weeks!inner(cohort_id)", { count: "exact", head: true })
    .eq("program_weeks.cohort_id", cohortRow.id)
    .eq("is_required", true),
]);
const { count: assignmentCount } = await admin
  .from("assignments")
  .select("*", { count: "exact", head: true })
  .eq("is_required", true);

check(
  "denominator = required modules + assignments + tasks",
  Number(itemCount),
  (moduleCount ?? 0) + (assignmentCount ?? 0) + (taskCount ?? 0),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (process.env.VERIFY_KEEP !== "1") {
  await cleanup();
  await admin.from("program_tasks").delete().eq("title", FIXTURE_TASK_TITLE);
  console.log("cleaned up test participants");
}
process.exit(failed === 0 ? 0 : 1);
