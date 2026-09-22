#!/usr/bin/env node
/**
 * Change a week's release or deadline (PRD F3.7).
 *
 * Moving a release earlier is the manual "release now" mechanism. Note that
 * released weeks never re-lock in the product's own logic — pushing a date
 * back here is a testing tool, not a product feature.
 *
 * Usage:
 *   node scripts/set-week-release.mjs                 # show current schedule
 *   node scripts/set-week-release.mjs 2 now           # open week 2 immediately
 *   node scripts/set-week-release.mjs 2 2026-09-28    # set a release date
 *   node scripts/set-week-release.mjs 2 lock          # push release into the future
 *   node scripts/set-week-release.mjs 1 deadline 2026-09-27
 */
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const [, , weekArg, action, dateArg] = process.argv;

const { data: cohort } = await admin.from("cohorts").select("id").eq("code", "ugc-01").single();

async function show() {
  const { data: weeks } = await admin
    .from("program_weeks")
    .select("number, title, release_at, deadline_at")
    .eq("cohort_id", cohort.id)
    .order("number");

  const fmt = (iso) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));

  console.log("\nWeek  State      Release (WAT)     Deadline (WAT)    Title");
  for (const w of weeks) {
    const open = new Date(w.release_at) <= new Date();
    console.log(
      `  ${String(w.number).padEnd(3)} ${(open ? "RELEASED" : "locked").padEnd(10)} ` +
        `${fmt(w.release_at).padEnd(17)} ${fmt(w.deadline_at).padEnd(17)} ${w.title}`,
    );
  }
  console.log();
}

if (!weekArg) {
  await show();
  process.exit(0);
}

const number = Number(weekArg);
if (!Number.isInteger(number) || number < 1) {
  console.error("Week must be a number, e.g. 2");
  process.exit(1);
}

let column = "release_at";
let value;

if (action === "now") {
  value = new Date().toISOString();
} else if (action === "lock") {
  value = new Date(Date.now() + 30 * 86_400_000).toISOString();
} else if (action === "deadline") {
  column = "deadline_at";
  value = new Date(`${dateArg}T23:59:00+01:00`).toISOString();
} else if (action) {
  value = new Date(`${action}T00:00:00+01:00`).toISOString();
} else {
  console.error("Give an action: now | lock | YYYY-MM-DD | deadline YYYY-MM-DD");
  process.exit(1);
}

if (Number.isNaN(new Date(value).getTime())) {
  console.error("Could not parse that date. Use YYYY-MM-DD.");
  process.exit(1);
}

const { error } = await admin
  .from("program_weeks")
  .update({ [column]: value })
  .eq("cohort_id", cohort.id)
  .eq("number", number);

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`✅ Week ${number} ${column} set.`);
await show();
