#!/usr/bin/env node
/**
 * Authentication verification against a real Supabase project and a running
 * PipeOps Learn app.
 *
 * This deliberately uses the two real participant paths:
 *   - Supabase OTP exchange for the numeric code
 *   - the application's /auth/confirm route for the email token hash
 *
 * To verify real delivery, request one email through /login and copy its code
 * into VERIFY_OTP. The suite consumes that code before minting other tokens.
 * The browser checks exercise the server action and therefore do not bypass
 * the invite-only gate with a direct database call.
 *
 * Usage:
 *   export $(grep -v '^#' .env.local | xargs)
 *   VERIFY_OTP=12345678 node scripts/verify-auth.mjs
 *
 * Optional:
 *   VERIFY_EMAIL=pipeops-test@yopmail.com
 *   VERIFY_BASE_URL=http://localhost:3000
 *   VERIFY_NON_ENROLLED_EMAIL=auth-non-enrolled@example.com
 *   VERIFY_KEEP=1
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const baseUrl =
  process.env.VERIFY_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const enrolledEmail = (process.env.VERIFY_EMAIL ?? "pipeops-test@yopmail.com").trim().toLowerCase();
// Optional: paste a code from a real delivered email to check the live
// template. Left unset, the suite mints its own and runs unattended.
const otpOverride = process.env.VERIFY_OTP?.replace(/\s+/g, "");
const nonEnrolledEmail = (
  process.env.VERIFY_NON_ENROLLED_EMAIL ?? `auth-non-enrolled-${Date.now()}@example.com`
)
  .trim()
  .toLowerCase();
const revokedEmail = `auth-revoked-${Date.now()}@example.com`;
const withdrawnEmail = `auth-withdrawn-${Date.now()}@example.com`;

if (!url || !serviceKey || !anonKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const publicClient = () => createClient(url, anonKey, { auth: { persistSession: false } });
let passed = 0;
let failed = 0;
const results = [];
const createdUserIds = new Set();
const createdEnrollmentIds = new Set();

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? passed++ : failed++;
  results.push({ name, ok, actual, expected });
  console.log(
    `${ok ? "✅" : "❌"} ${name}${ok ? "" : `\n     expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
}

async function findUser(email) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
}

async function findCohort() {
  const { data, error } = await admin
    .from("cohorts")
    .select("id, status")
    .eq("code", "ugc-01")
    .single();
  if (error || !data)
    throw new Error(`could not find ugc-01: ${error?.message ?? "missing cohort"}`);
  return data;
}

async function ensureTestEnrollment(email, status = "active") {
  const cohort = await findCohort();
  const { data: existing, error: existingError } = await admin
    .from("enrollments")
    .select("id, user_id, status")
    .eq("cohort_id", cohort.id)
    .eq("email", email)
    .maybeSingle();
  if (existingError) throw new Error(`find enrollment: ${existingError.message}`);
  if (existing) {
    if (existing.status !== status) {
      const { error } = await admin.from("enrollments").update({ status }).eq("id", existing.id);
      if (error) throw new Error(`set enrollment status: ${error.message}`);
    }
    return existing;
  }

  const { data, error } = await admin
    .from("enrollments")
    .insert({ cohort_id: cohort.id, email, name: `Auth verification ${email}`, status })
    .select("id, user_id, status")
    .single();
  if (error || !data) throw new Error(`create enrollment: ${error?.message ?? "missing row"}`);
  createdEnrollmentIds.add(data.id);
  return data;
}

async function ensureUser(email) {
  const existing = await findUser(email);
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`create test user: ${error?.message ?? "missing user"}`);
  createdUserIds.add(data.user.id);
  return data.user;
}

async function expectGateMessage(label, email, expectedText) {
  const before = await findUser(email);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send me a code" }).click();
    // Assert the message reaches the PAGE, not a particular node. In dev the
    // Next overlay also carries role="alert", so pinning to one element picks
    // the wrong one — and pinning to a selector would break on any markup
    // change without the behaviour changing (AGENTS.md section 10).
    await page
      .getByText(expectedText, { exact: false })
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    const body = (await page.textContent("body")) ?? "";
    check(`${label} receives the invite-only rejection`, body.includes(expectedText), true);
  } finally {
    await browser.close();
  }
  const after = await findUser(email);
  check(
    `${label} does not create an auth user when rejected`,
    after?.id ?? null,
    before?.id ?? null,
  );
}

async function cleanup() {
  if (process.env.VERIFY_KEEP === "1") return;
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  for (const id of createdEnrollmentIds) await admin.from("enrollments").delete().eq("id", id);
  console.log("cleaned up verification records");
}

let enrolledUser;
let enrolledEnrollment;
try {
  if (otpOverride) {
    const { data, error } = await admin
      .from("enrollments")
      .select("id, user_id, status")
      .eq("email", enrolledEmail)
      .eq("status", "active")
      .limit(1);
    if (error || !data?.[0]) {
      throw new Error(`real-email verification requires an existing active enrolment`);
    }
    enrolledEnrollment = data[0];
    enrolledUser = await findUser(enrolledEmail);
    if (!enrolledUser) throw new Error("real-email verification requires a pre-created auth user");
  } else {
    enrolledEnrollment = await ensureTestEnrollment(enrolledEmail);
    enrolledUser = await ensureUser(enrolledEmail);
  }

  const { data: linked } = await admin
    .from("enrollments")
    .select("id, user_id")
    .eq("id", enrolledEnrollment.id)
    .single();
  check(
    "handle_new_user links the enrolled email to its auth user",
    linked?.user_id,
    enrolledUser.id,
  );

  const otpClient = publicClient();

  // Minting another link would invalidate the code that arrived by email.
  // Use the delivered code first; only unattended runs generate their own.
  let otp = otpOverride;
  if (!otp) {
    const { data: issued, error: requestError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: enrolledEmail,
    });
    check("enrolled address receives an OTP request", requestError, null);
    check("the issued token carries a numeric code", Boolean(issued?.properties?.email_otp), true);
    otp = issued?.properties?.email_otp;
  }

  const { data: otpSession, error: otpError } = await otpClient.auth.verifyOtp({
    email: enrolledEmail,
    token: otp,
    type: "email",
  });
  check("the numeric OTP exchanges without an auth error", otpError, null);
  check("the numeric OTP creates a real session", Boolean(otpSession?.session?.access_token), true);
  check(
    "the numeric OTP session belongs to the enrolled user",
    otpSession?.user?.id,
    enrolledUser.id,
  );

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: enrolledEmail,
  });
  if (linkError || !link?.properties.hashed_token) {
    throw new Error(`generate magic link: ${linkError?.message ?? "missing token hash"}`);
  }

  const linkBrowser = await chromium.launch({ headless: true });
  try {
    const page = await linkBrowser.newPage();
    const response = await page.goto(
      `${baseUrl}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink`,
      { waitUntil: "networkidle" },
    );
    check(
      "the token hash reaches /auth/confirm and lands on the app",
      response?.ok() ?? false,
      true,
    );
    check("the magic-link session lands at the dashboard", new URL(page.url()).pathname, "/");
  } finally {
    await linkBrowser.close();
  }

  const consumed = publicClient();
  const { data: reusableLink, error: reusableLinkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: enrolledEmail,
  });
  if (reusableLinkError || !reusableLink?.properties.hashed_token) {
    throw new Error(
      `generate consumed-token link: ${reusableLinkError?.message ?? "missing token hash"}`,
    );
  }
  const firstUse = await consumed.auth.verifyOtp({
    token_hash: reusableLink.properties.hashed_token,
    type: "magiclink",
  });
  check("a magic-link token can be consumed once", firstUse.error, null);
  const secondUse = await consumed.auth.verifyOtp({
    token_hash: reusableLink.properties.hashed_token,
    type: "magiclink",
  });
  check("a consumed magic-link token cannot be reused", Boolean(secondUse.error), true);

  const notEnrolledMessage =
    "We couldn't find this email in the current PipeOps UGC Program cohort. " +
    "If you were accepted, check which address you applied with.";
  await expectGateMessage("non-enrolled address", nonEnrolledEmail, notEnrolledMessage);

  await ensureTestEnrollment(revokedEmail, "revoked");
  await ensureTestEnrollment(withdrawnEmail, "withdrawn");
  const restrictedMessage =
    "Your place in this cohort is no longer active. Contact the programme team.";
  await expectGateMessage("revoked address", revokedEmail, restrictedMessage);
  await expectGateMessage("withdrawn address", withdrawnEmail, restrictedMessage);
} catch (error) {
  failed++;
  console.error(
    `❌ verification aborted: ${error instanceof Error ? error.message : String(error)}`,
  );
} finally {
  await cleanup();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
