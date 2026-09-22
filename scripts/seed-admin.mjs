#!/usr/bin/env node
/**
 * Seed a staff account with a password.
 *
 * Staff use email + password (separate door at /admin/login); participants stay
 * passwordless. Rerunning this resets the password for an existing account.
 *
 * Usage:
 *   node scripts/seed-admin.mjs precious@pipeops.io
 *   node scripts/seed-admin.mjs precious@pipeops.io 'my-own-password'
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [, , emailArg, passwordArg] = process.argv;
if (!emailArg) {
  console.error("usage: node scripts/seed-admin.mjs <email> [password]");
  process.exit(1);
}

const email = emailArg.toLowerCase();

// Readable but high-entropy: 4 words plus digits beats a random string you
// will paste into a chat window and then mistype.
const WORDS = [
  "cohort",
  "creator",
  "ember",
  "harbour",
  "lantern",
  "meridian",
  "onyx",
  "quarry",
  "ridge",
  "signal",
  "thistle",
  "vector",
  "willow",
  "zenith",
];
function generate() {
  const pick = () => WORDS[randomBytes(1)[0] % WORDS.length];
  const digits = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");
  return `${pick()}-${pick()}-${pick()}-${digits}`;
}

const password = passwordArg ?? generate();

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: cohort } = await admin.from("cohorts").select("id").eq("code", "ugc-01").single();

// Staff need an enrolment row too, because is_admin() and the participant
// view both resolve through it.
await admin
  .from("enrollments")
  .upsert(
    { cohort_id: cohort.id, email, name: email.split("@")[0] },
    { onConflict: "cohort_id,email", ignoreDuplicates: true },
  );

const { data: list } = await admin.auth.admin.listUsers();
const existing = list.users.find((u) => u.email === email);

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
} else {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const { error: roleError } = await admin.from("users").update({ role: "admin" }).eq("email", email);
if (roleError) {
  console.error(roleError.message);
  process.exit(1);
}

const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
console.log(`
  ${base}/admin/login

  email     ${email}
  password  ${password}

Change it from your Supabase dashboard (Authentication → Users) once you are in.
`);
