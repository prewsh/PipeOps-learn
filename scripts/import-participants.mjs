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

console.log(`\nImporting ${participants.length} participant(s) into ${cohort.name}:\n`);
for (const p of participants.slice(0, 5))
  console.log(`  ${p.email}${p.name ? ` — ${p.name}` : ""}`);
if (participants.length > 5) console.log(`  … and ${participants.length - 5} more`);

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
