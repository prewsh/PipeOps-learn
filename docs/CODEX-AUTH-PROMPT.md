# Prompt for Codex — make email sign-in actually deliver

Paste everything below the line into Codex. It has Supabase MCP access to this
project.

---

Fix email authentication in this Next.js 16 + Supabase project (PipeOps Learn).
You have Supabase MCP access. Read `AGENTS.md` and `docs/PRD.md` before changing
anything.

## Context

Invite-only cohort platform launching this week. 114 participants are already in
`public.enrollments`. Sign-in is **email only** — a magic link plus a numeric
code, both in the same message. This is deliberate and is not up for
renegotiation: do **not** add Google OAuth, social login, passwords, or a public
signup route. See `docs/decisions/0002-passwordless-invite-only-auth.md`.

The application code works. I have verified against the live project that:

- `supabase.auth.signInWithOtp` issues both a `TokenHash` and a numeric
  `email_otp`
- `verifyOtp({ email, token, type: "email" })` returns a valid session
- `/auth/confirm?token_hash=…&type=magiclink` establishes a session and lands on
  the dashboard
- the enrolment gate rejects any address not in `public.enrollments`

**The problem is delivery and configuration, not application code.** Nothing
arrives, and what does arrive is unusable.

## What is broken

1. **Supabase's built-in SMTP is rate-limited to a handful of messages per hour**
   and is documented as test-only. It cannot serve a 114-person cohort. This is
   the blocking issue.
2. **The Magic Link email template is still the Supabase default.** It contains
   only `{{ .ConfirmationURL }}`, so no code is ever sent, and the URL points at
   Supabase's verify endpoint rather than this app's `/auth/confirm` route.
3. **Site URL and redirect allow-list** have not been confirmed for local
   development or production.
4. **Auth rate limits** are at their defaults, which will throttle a launch-day
   burst of ~114 sign-ins.

## Tasks

1. **Custom SMTP.** Configure it on the Supabase project (Resend is the
   intended provider; its free tier covers this volume). Report exactly which
   steps must be done by hand in the dashboard versus which you completed. Never
   invent or guess an API key — ask me for it.

2. **Email template.** Replace the Magic Link template so it carries *both*
   paths. The code must come first: magic links break inside the LinkedIn and X
   in-app browsers, which is where many of these participants read email.

   ```html
   <h2>Sign in to PipeOps Learn</h2>
   <p>Your sign-in code:</p>
   <p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
   <p>Or tap this link:</p>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
   <p>This expires in an hour. If you didn't ask for it, ignore this email.</p>
   ```

   Keep the plain-text alternative in step with it.

3. **URL configuration.** Set Site URL to the production origin and add
   `http://localhost:3000` plus the production origin to the redirect allow-list.

4. **OTP length.** This project currently issues 8-digit codes. The client now
   accepts 6–10 digits, so either length works — but tell me which is
   configured, and if you change it, say so. Do not narrow the client
   validation to a fixed length; a client stricter than the server makes a valid
   code unenterable. That bug was already found and fixed once.

5. **Rate limits.** Raise the auth email rate limit enough for ~114 sign-ins in
   a launch window, and tell me the value you set.

6. **Verification.** Write `scripts/verify-auth.mjs`, following the style of the
   existing `scripts/verify-p1.mjs`, `verify-p2.mjs`, `verify-p3.mjs`. It must
   use real sessions, not mocks, and assert:
   - an enrolled address receives a token and can exchange the numeric code for
     a session
   - the same address can instead exchange the `token_hash` via `/auth/confirm`
   - a non-enrolled address is rejected, and the failure message does not reveal
     whether that address exists anywhere in the system
   - a revoked or withdrawn enrolment cannot sign in
   - a consumed token cannot be reused

   Print a pass/fail summary and exit non-zero on any failure.

7. **Send a real test email** to `pipeops-test@yopmail.com` (inbox at
   yopmail.com) and confirm the code and the link both work end to end. Report
   what actually arrived.

## Constraints

- `pnpm verify` (typecheck + lint + build) must pass. This project uses **Biome**,
  not ESLint or Prettier.
- No new dependencies.
- Do not weaken the enrolment gate, any RLS policy, or the `handle_new_user`
  trigger. There must remain no public signup path.
- Do not edit a migration that has already been applied; add a new one.
- Follow `AGENTS.md` §10 on testing: no tautological tests, no change-detector
  tests, no reflexive regression tests.
- Follow `AGENTS.md` §11 on git: do **not** add Claude, Codex, Anthropic, OpenAI
  or any AI tool as author, co-author or contributor, and no "Generated with…"
  line anywhere.
- Report honestly what you could not do, rather than reporting success.
