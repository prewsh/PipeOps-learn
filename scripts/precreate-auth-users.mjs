#!/usr/bin/env node
/**
 * Pre-create a confirmed auth user for every enrolled participant.
 *
 * Why this exists: Supabase picks the email template by flow, not by intent.
 * `signInWithOtp` on an address with no auth user takes the SIGNUP path and
 * sends the "Confirm signup" template — not "Magic Link". With 112 of 114
 * participants never having signed in, fixing only the Magic Link template
 * would leave almost the whole cohort receiving the wrong email.
 *
 * Creating the users up front means everyone takes the magic-link path, so
 * there is one template to get right instead of two kept in sync.
 *
 * Sends nothing. Idempotent. Safe to re-run.
 *
 * Usage:
 *   node scripts/precreate-auth-users.mjs --dry-run
 *   node scripts/precreate-auth-users.mjs
 */
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: enrollments, error } = await admin
  .from("enrollments")
  .select("email, name, status")
  .eq("status", "active");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const existing = new Set();
let page = 1;
for (;;) {
  const { data, error: listError } = await admin.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (listError) {
    console.error(`Could not list Auth users: ${listError.message}`);
    process.exit(1);
  }
  if (!data?.users.length) break;
  for (const u of data.users) if (u.email) existing.add(u.email.toLowerCase());
  if (data.users.length < 1000) break;
  page += 1;
}

const missing = enrollments.filter((e) => !existing.has(e.email.toLowerCase()));

console.log(`enrolled (active): ${enrollments.length}`);
console.log(`already have an auth user: ${enrollments.length - missing.length}`);
console.log(`to create: ${missing.length}\n`);

if (dryRun) {
  console.log("\nDry run — nothing was written.");
  process.exit(0);
}

let created = 0;
let failed = 0;

for (const [index, m] of missing.entries()) {
  const { error: err } = await admin.auth.admin.createUser({
    email: m.email,
    email_confirm: true,
    user_metadata: m.name ? { name: m.name } : undefined,
  });
  if (err && !/already|registered/i.test(err.message)) {
    console.error(`  ✗ user ${index + 1}: ${err.message}`);
    failed += 1;
  } else {
    created += 1;
  }
}

const { count: unlinked, error: countError } = await admin
  .from("enrollments")
  .select("*", { count: "exact", head: true })
  .eq("status", "active")
  .is("user_id", null);

if (countError) {
  console.error(`Could not verify enrolments: ${countError.message}`);
  process.exit(1);
}

console.log(`\n✅ created ${created}${failed ? `, ${failed} failed` : ""}`);
console.log(`active enrolments still unlinked: ${unlinked}`);
if (failed || unlinked) process.exitCode = 1;
