#!/usr/bin/env node
/**
 * Import accepted participants into a cohort (PRD F1, "Participant import").
 *
 * Usage:
 *   node scripts/import-participants.mjs participants.csv [cohort-code]
 *
 * CSV needs a header row with at least `email`. `name` is optional:
 *   email,name
 *   ada@example.com,Ada Okafor
 *
 * Validates every row first and prints a preview. Nothing is written unless
 * every row parses. Re-running is safe: existing enrolments are left alone.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [, , csvPath, cohortCode = "ugc-01"] = process.argv;

if (!csvPath) {
  console.error("usage: node scripts/import-participants.mjs <file.csv> [cohort-code]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  console.error("  export $(grep -v '^#' .env.local | xargs)");
  process.exit(1);
}

const rows = readFileSync(csvPath, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

if (rows.length < 2) {
  console.error("CSV needs a header row and at least one participant.");
  process.exit(1);
}

const header = rows[0].split(",").map((h) => h.trim().toLowerCase());
const emailIdx = header.indexOf("email");
const nameIdx = header.indexOf("name");

if (emailIdx === -1) {
  console.error(`No "email" column found. Header was: ${header.join(", ")}`);
  process.exit(1);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const participants = [];
const problems = [];
const seen = new Set();

rows.slice(1).forEach((line, i) => {
  const cells = line.split(",").map((c) => c.trim());
  const email = (cells[emailIdx] ?? "").toLowerCase();
  const name = nameIdx === -1 ? null : (cells[nameIdx] ?? null) || null;
  const lineNo = i + 2;

  if (!EMAIL_RE.test(email)) {
    problems.push(`line ${lineNo}: invalid email "${email}"`);
    return;
  }
  if (seen.has(email)) {
    problems.push(`line ${lineNo}: duplicate "${email}"`);
    return;
  }

  seen.add(email);
  participants.push({ email, name });
});

if (problems.length) {
  console.error(`\n${problems.length} problem(s) — nothing was imported:\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: cohort, error: cohortError } = await supabase
  .from("cohorts")
  .select("id, name")
  .eq("code", cohortCode)
  .maybeSingle();

if (cohortError || !cohort) {
  console.error(`Cohort "${cohortCode}" not found. Run supabase/schema.sql first.`);
  process.exit(1);
}

console.log(`\nImporting ${participants.length} participant(s) into ${cohort.name}.`);

const { data, error } = await supabase
  .from("enrollments")
  .upsert(
    participants.map((p) => ({ cohort_id: cohort.id, email: p.email, name: p.name })),
    { onConflict: "cohort_id,email", ignoreDuplicates: true },
  )
  .select("email");

if (error) {
  console.error(`\nImport failed: ${error.message}`);
  process.exit(1);
}

const { count } = await supabase
  .from("enrollments")
  .select("*", { count: "exact", head: true })
  .eq("cohort_id", cohort.id);

console.log(`\n✅ ${data?.length ?? 0} new, ${count} total enrolled in ${cohort.name}.`);

// Signup is disabled at the Auth level (invite-only), so an enrolment without
// a login account is someone who can never sign in: the login page would tell
// them "we couldn't send that email" forever. Create the accounts in the same
// step the enrolments are made, never as a separate thing to remember.
let created = 0;
let failedAccounts = 0;
for (const [index, p] of participants.entries()) {
  const { error: accountError } = await supabase.auth.admin.createUser({
    email: p.email,
    email_confirm: true,
    user_metadata: p.name ? { name: p.name } : undefined,
  });
  if (!accountError) created += 1;
  else if (!/already|registered|exists/i.test(accountError.message)) {
    failedAccounts += 1;
    console.error(`  ✗ account for row ${index + 1}: ${accountError.message}`);
  }
}

// An account that already existed (say, from an earlier cohort) is not linked
// by the new-user trigger, which only fires on creation. Link by email.
const { data: unlinked } = await supabase
  .from("enrollments")
  .select("id, email")
  .eq("cohort_id", cohort.id)
  .is("user_id", null);
for (const e of unlinked ?? []) {
  const { data: u } = await supabase.from("users").select("id").eq("email", e.email).maybeSingle();
  if (u) await supabase.from("enrollments").update({ user_id: u.id }).eq("id", e.id);
}

const { count: stillUnlinked } = await supabase
  .from("enrollments")
  .select("*", { count: "exact", head: true })
  .eq("cohort_id", cohort.id)
  .eq("status", "active")
  .is("user_id", null);

console.log(
  `   ${created} login account(s) created${failedAccounts ? `, ${failedAccounts} failed` : ""}.`,
);
console.log(`   Active enrolments still without an account: ${stillUnlinked ?? 0}`);
console.log("   Nobody has been emailed. Send invites from /admin/invites.");
if (failedAccounts || stillUnlinked) process.exitCode = 1;
