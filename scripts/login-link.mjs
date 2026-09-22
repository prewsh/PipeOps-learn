#!/usr/bin/env node
/**
 * Generate a working sign-in link without sending email.
 *
 * Supabase's built-in SMTP on the free tier is rate-limited to a handful of
 * messages an hour and is documented as test-only, so it cannot be relied on
 * for testing — let alone for a 114-person cohort. This bypasses email
 * entirely by minting the same token the email would have carried.
 *
 * Local testing only. Never expose this path in the app.
 *
 * Usage: node scripts/login-link.mjs someone@example.com [--admin]
 */
import { createClient } from "@supabase/supabase-js";

const [, , email, ...flags] = process.argv;
if (!email) {
  console.error("usage: node scripts/login-link.mjs <email> [--admin]");
  process.exit(1);
}

const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: enrollment } = await admin
  .from("enrollments")
  .select("id, name, status")
  .eq("email", email.toLowerCase())
  .maybeSingle();

if (!enrollment) {
  console.error(`${email} is not enrolled in any cohort. Import them first.`);
  process.exit(1);
}

const { error: createErr } = await admin.auth.admin.createUser({
  email: email.toLowerCase(),
  email_confirm: true,
});
if (createErr && !/already|registered/i.test(createErr.message)) {
  console.error(createErr.message);
  process.exit(1);
}

if (flags.includes("--admin")) {
  await admin.from("users").update({ role: "admin" }).eq("email", email.toLowerCase());
}

const { data: link, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: email.toLowerCase(),
});
if (error) {
  console.error(error.message);
  process.exit(1);
}

const { data: user } = await admin
  .from("users")
  .select("role")
  .eq("email", email.toLowerCase())
  .maybeSingle();

console.log(`\n${enrollment.name ?? email} · role: ${user?.role ?? "participant"}\n`);
console.log(`${base}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink\n`);
console.log("Paste that into your browser. Single use, expires in ~1 hour.\n");
