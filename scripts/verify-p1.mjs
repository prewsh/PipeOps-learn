#!/usr/bin/env node
/**
 * Prototype 1 verification — runs against a real Supabase project.
 *
 * This authenticates as a genuine participant (real JWT, real RLS) rather than
 * impersonating a role in psql, so it exercises the path a participant
 * actually takes. It asserts the invariants that matter, not the ones that are
 * easy to check:
 *
 *   - a locked week yields ZERO modules, lessons and materials
 *   - video progress is MONOTONIC: a lower position never lowers the maximum
 *   - watched_seconds ACCUMULATES and is not the playhead position
 *   - completion is idempotent: re-completing never moves the timestamp
 *
 * Usage:  export $(grep -v '^#' .env.local | xargs) && node scripts/verify-p1.mjs
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.VERIFY_EMAIL ?? "rls-test@pipeops.io";

if (!url || !serviceKey || !anonKey) {
  console.error("Missing env. export $(grep -v '^#' .env.local | xargs)");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? passed++ : failed++;
  results.push({ name, ok, actual, expected });
  console.log(
    `${ok ? "✅" : "❌"} ${name}${ok ? "" : `\n     expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
}

// ---------------------------------------------------------------- setup ----
const { data: cohort } = await admin.from("cohorts").select("id").eq("code", "ugc-01").single();

await admin
  .from("enrollments")
  .upsert(
    { cohort_id: cohort.id, email: EMAIL, name: "RLS Test User" },
    { onConflict: "cohort_id,email", ignoreDuplicates: true },
  );

const { error: createErr } = await admin.auth.admin.createUser({
  email: EMAIL,
  email_confirm: true,
});
if (createErr && !/already|registered/i.test(createErr.message)) {
  console.error("createUser failed:", createErr.message);
  process.exit(1);
}

const { data: list } = await admin.auth.admin.listUsers();
const uid = list.users.find((u) => u.email === EMAIL)?.id;

const { data: enr } = await admin
  .from("enrollments")
  .select("id, user_id")
  .eq("email", EMAIL)
  .single();
check("handle_new_user() links enrolment to auth account by email", enr.user_id === uid, true);

// Sign in as that participant for real.
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
const as = createClient(url, anonKey, { auth: { persistSession: false } });
const { error: sessionErr } = await as.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: "magiclink",
});
if (sessionErr) {
  console.error("could not establish participant session:", sessionErr.message);
  process.exit(1);
}

// ------------------------------------------------------ week visibility ----
const { data: weeks } = await as
  .from("program_weeks")
  .select("id, number, release_at")
  .order("number");
// Derived, not pinned: the programme gained a seventh week and a test that
// hard-codes the count fails without anything being wrong.
const { count: weekCount } = await admin
  .from("program_weeks")
  .select("*", { count: "exact", head: true })
  .eq("cohort_id", cohort.id);
check("participant sees every week (locked cards still render)", weeks?.length, weekCount);

const released = weeks.filter((w) => new Date(w.release_at) <= new Date());
const locked = weeks.filter((w) => new Date(w.release_at) > new Date());
// Derived from the schedule: opening another week must not fail this.
const { data: dbReleased } = await admin
  .from("program_weeks")
  .select("number")
  .eq("cohort_id", cohort.id)
  .lte("release_at", new Date().toISOString());
check(
  "released weeks match the schedule",
  released.map((w) => w.number).sort((a, b) => a - b),
  (dbReleased ?? []).map((w) => w.number).sort((a, b) => a - b),
);

// THE invariant: locked weeks leak nothing.
const { data: lockedLinks } = await as
  .from("week_modules")
  .select("id")
  .in(
    "week_id",
    locked.map((w) => w.id),
  );
check("locked weeks expose ZERO modules", lockedLinks?.length, 0);

const { data: visibleModules } = await as.from("modules").select("id, number, code, is_bonus");

// The participant should see exactly the modules that sit in released weeks.
const { data: expectedModules } = await admin
  .from("week_modules")
  .select("modules!inner(code), program_weeks!inner(cohort_id, release_at)")
  .eq("program_weeks.cohort_id", cohort.id)
  .lte("program_weeks.release_at", new Date().toISOString());
const expectedCodes = (expectedModules ?? []).map((r) => r.modules.code).sort();

check(
  "visible modules are exactly those in released weeks",
  visibleModules?.map((m) => m.code).sort(),
  expectedCodes,
);

const { data: visibleLessons } = await as.from("lessons").select("id, module_id");
check("one visible lesson per visible module", visibleLessons?.length, visibleModules.length);

const { data: lockedMaterials } = await as
  .from("learning_materials")
  .select("id")
  .eq("owner_type", "week")
  .in(
    "owner_id",
    locked.map((w) => w.id),
  );
check("locked-week materials are hidden", lockedMaterials?.length, 0);

const { data: week1Materials } = await as
  .from("learning_materials")
  .select("id")
  .eq("owner_type", "week")
  .eq("owner_id", released[0].id);
check("week 1 materials are visible", week1Materials?.length, 2);

// ---------------------------------------------- activity is server-only ----
const { error: activityErr } = await as
  .from("activity_events")
  .insert({ enrollment_id: enr.id, type: "FORGED" });
check("participant CANNOT write activity_events", Boolean(activityErr), true);

// -------------------------------------------------------- video progress ----
const requiredModuleIds = new Set(visibleModules.filter((m) => !m.is_bonus).map((m) => m.id));
const lessons = visibleLessons.filter((l) => requiredModuleIds.has(l.module_id));
const lesson = lessons[0];
await admin.from("video_progress").delete().eq("enrollment_id", enr.id);

// Watch time is capped by the wall clock — you cannot accumulate more seconds
// of viewing than have actually elapsed. To exercise genuine playback the
// suite has to age the row rather than claim an impossible delta, which is
// the same thing a real participant does by waiting.
const age = async (seconds) =>
  admin
    .from("video_progress")
    .update({ last_seen_at: new Date(Date.now() - seconds * 1000).toISOString() })
    .eq("enrollment_id", enr.id)
    .eq("lesson_id", lesson.id);

// A first flush claiming five minutes of viewing in the first second.
await as.rpc("record_video_progress", {
  p_lesson_id: lesson.id,
  p_position_seconds: 300,
  p_delta_seconds: 300,
  p_duration_seconds: 720,
});
const { data: capped } = await as
  .from("video_progress")
  .select("watched_seconds")
  .eq("lesson_id", lesson.id)
  .single();
check("an impossible delta is clamped to elapsed time", capped.watched_seconds, 20);

// An out-of-order flush arriving late with a LOWER position must not regress.
await as.rpc("record_video_progress", {
  p_lesson_id: lesson.id,
  p_position_seconds: 10,
  p_delta_seconds: 5,
  p_duration_seconds: 720,
});

const { data: vp } = await as
  .from("video_progress")
  .select("max_position_seconds, watched_seconds, percentage_watched, completed_at")
  .eq("lesson_id", lesson.id)
  .single();

check("max_position is monotonic (300 not 10)", vp.max_position_seconds, 300);
check("watched_seconds accumulates (20 + 5)", vp.watched_seconds, 25);
check("not complete at 3% watched", vp.completed_at, null);

// Scrub to the end without watching: position jumps, watched does not.
await age(400);
await as.rpc("record_video_progress", {
  p_lesson_id: lesson.id,
  p_position_seconds: 719,
  p_delta_seconds: 2,
  p_duration_seconds: 720,
});
const { data: vp2 } = await as
  .from("video_progress")
  .select("watched_seconds, completed_at")
  .eq("lesson_id", lesson.id)
  .single();
check("scrubbing to the end is NOT watching", vp2.completed_at, null);

// The player's own "ended" event cannot stand in for watching either.
const second = lessons[1];
if (second) {
  await admin
    .from("video_progress")
    .delete()
    .eq("enrollment_id", enr.id)
    .eq("lesson_id", second.id);
  await as.rpc("record_video_progress", {
    p_lesson_id: second.id,
    p_position_seconds: 0,
    p_delta_seconds: 1,
    p_duration_seconds: 720,
    p_ended: true,
  });
  const { data: ended } = await as
    .from("video_progress")
    .select("completed_at")
    .eq("lesson_id", second.id)
    .single();
  check("p_ended alone does not complete an unwatched video", ended.completed_at, null);
}

// Genuine playback: time really passes, and the viewing is real.
await age(700);
await as.rpc("record_video_progress", {
  p_lesson_id: lesson.id,
  p_position_seconds: 700,
  p_delta_seconds: 700,
  p_duration_seconds: 720,
});
const { data: vp3 } = await as
  .from("video_progress")
  .select("watched_seconds, percentage_watched, completed_at")
  .eq("lesson_id", lesson.id)
  .single();
check("completes at >= 90% genuinely watched", vp3.completed_at !== null, true);
check("watched_seconds never exceeds duration", vp3.watched_seconds <= 720, true);

// ---------------------------------------------------- module completion ----
const moduleId = visibleModules.find((m) => m.code === "M01").id;
await admin.from("module_progress").delete().eq("enrollment_id", enr.id);

await as.rpc("complete_module", { p_module_id: moduleId, p_via: "manual" });
const { data: mp1 } = await as
  .from("module_progress")
  .select("completed_at, status")
  .eq("module_id", moduleId)
  .single();

await as.rpc("complete_module", { p_module_id: moduleId, p_via: "auto" });
const { data: mp2 } = await as
  .from("module_progress")
  .select("completed_at")
  .eq("module_id", moduleId)
  .single();

check("module marked complete", mp1.status, "completed");
check("re-completing is idempotent (timestamp unchanged)", mp1.completed_at, mp2.completed_at);

const { data: after } = await admin
  .from("enrollments")
  .select("progress_pct")
  .eq("id", enr.id)
  .single();
// Assert the RELATIONSHIP, not a hardcoded percentage. The denominator grows
// as each prototype adds required item types (modules, then assignments and
// tasks), and a test that pins the constant would fail on every such change
// without any behaviour being wrong — a change-detector (AGENTS.md section 10).
const { data: denominator } = await as.rpc("program_item_count");
const expectedPct = Math.round((1 / Number(denominator)) * 10000) / 100;
check(
  `progress = 1 completed / ${denominator} required items`,
  Number(after.progress_pct),
  expectedPct,
);

// Success Metrics became taught content, so this cohort currently has no
// bonus module. The invariant still matters the moment one is added, so the
// check runs when there is something to check rather than asserting nothing.
const bonusModule = visibleModules.find((m) => m.is_bonus);
if (bonusModule) {
  await as.rpc("complete_module", { p_module_id: bonusModule.id, p_via: "manual" });
  const { data: afterBonus } = await admin
    .from("enrollments")
    .select("progress_pct")
    .eq("id", enr.id)
    .single();
  check(
    "completing a BONUS module does not change progress",
    Number(afterBonus.progress_pct),
    expectedPct,
  );
}

const { data: denominatorAfter } = await as.rpc("program_item_count");
check("the denominator is stable across completions", denominatorAfter, denominator);

// ------------------------------------------------- cross-participant leak ----
const { data: othersProgress } = await as.from("module_progress").select("id");
check(
  "participant sees only their own module_progress",
  othersProgress?.length,
  bonusModule ? 2 : 1,
);

// ------------------------------------------------- every page renders ----
// A page that throws in a Server Component returns 500, and until this existed
// nothing noticed. The module page did exactly that: its queries relied on RLS
// to mean "my rows", which is false for an admin previewing the participant
// app, so `.maybeSingle()` got three rows and threw. Reviewing a diff would not
// have found it; loading the page does.
//
// Status code, not page content — it is the one signal that means "the server
// failed" in both dev and production.
const baseUrl =
  process.env.VERIFY_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const { data: smokeLink } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(
    `${baseUrl}/auth/confirm?token_hash=${encodeURIComponent(smokeLink.properties.hashed_token)}&type=magiclink`,
    { waitUntil: "networkidle" },
  );

  // A module in a released week, resolved rather than hard-coded — the
  // programme is edited from the admin screens.
  const openModule = visibleModules.find((m) => !m.is_bonus);
  const { data: openSlug } = await admin
    .from("modules")
    .select("slug")
    .eq("id", openModule.id)
    .single();
  const { data: openWeek } = await admin
    .from("program_weeks")
    .select("number")
    .eq("cohort_id", cohort.id)
    .lte("release_at", new Date().toISOString())
    .order("number")
    .limit(1)
    .single();

  for (const path of [
    "/",
    "/learn",
    `/learn/week/${openWeek.number}`,
    `/learn/module/${openSlug.slug}`,
    "/tasks",
    "/leaderboard",
    "/sessions",
    "/resources",
    "/announcements",
    "/settings",
    "/more",
  ]) {
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
    check(`${path} renders without a server error`, response?.status(), 200);
  }
} finally {
  await browser.close();
}

// --------------------------------------------------------------- report ----
console.log(`\n${passed} passed, ${failed} failed`);
if (process.env.VERIFY_KEEP !== "1") {
  await admin.from("enrollments").delete().eq("email", EMAIL);
  if (uid) await admin.auth.admin.deleteUser(uid);
  console.log("cleaned up test participant");
}
process.exit(failed === 0 ? 0 : 1);
