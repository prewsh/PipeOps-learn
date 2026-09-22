#!/usr/bin/env node
/**
 * Grant admin (or reviewer) role.
 *
 * Role lives on the user record, never on an email domain (PRD F1.9), so this
 * is the only way in. The user must have signed in at least once.
 *
 * Usage: node scripts/make-admin.mjs someone@pipeops.io [admin|reviewer]
 */
import { createClient } from "@supabase/supabase-js";

const [, , email, role = "admin"] = process.argv;
if (!email) {
  console.error("usage: node scripts/make-admin.mjs <email> [admin|reviewer]");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data, error } = await admin
  .from("users")
  .update({ role })
  .eq("email", email.toLowerCase())
  .select("email, role");

if (error) {
  console.error(error.message);
  process.exit(1);
}
if (!data?.length) {
  console.error(`No user row for ${email}. They must sign in once first.`);
  process.exit(1);
}
console.log(`✅ ${data[0].email} is now ${data[0].role}`);
