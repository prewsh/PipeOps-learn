# Deployment — PipeOps Learn

Target: `pipeops-learn.pipeops.app` on PipeOps. Supabase project `rxkobtsfvtogswobfdez`.

---

## 1. Environment

Set these on the PipeOps service. Only the first two reach the browser.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Bypasses RLS. Server only — never expose it to the client or a build log. |
| `NEXT_PUBLIC_APP_URL` | `https://pipeops-learn.pipeops.app` |

`SUPABASE_DB_URL` is local tooling only (psql, migrations). Do **not** set it in production.

## 2. Build

Next.js `output: "standalone"`, so the container needs Node 22 and:

```bash
pnpm install --frozen-lockfile
pnpm build
node .next/standalone/server.js
```

`pnpm verify` (typecheck + lint + build) must pass before a deploy. It is the definition of done.

## 3. Supabase — do these before first traffic

- [ ] **Custom SMTP** configured (the current project uses Google Gmail SMTP). The built-in sender is rate-limited to a handful an hour and cannot serve 114 people.
- [ ] **Both email templates** updated — "Confirm signup" (`sign-in.html`) *and* "Magic Link" (`sign-in-magiclink.html`), each with the subject in `subject.txt`. Most participants have never signed in, so they hit the signup template. See `docs/email-templates/`.
  Each template holds two emails. A send redirecting to `/login` renders the **invite** (welcome, a button to `/login`, no code); anything else renders the **sign-in** email (code and link). The sign-in link uses the approved callback address, with the production callback as its fallback. Update the templates *before* deploying code that sends invites, or an invite goes out as a sign-in email whose link only opens the sign-in page.
- [ ] **Email rate limit** covers two emails per participant: the invite, then the sign-in email they request from it. For 114 people that is ~230 in the launch hour.
- [ ] **Site URL** = `https://pipeops-learn.pipeops.app`.
- [ ] **Redirect allow-list** includes `https://pipeops-learn.pipeops.app/auth/confirm` and `https://pipeops-learn.pipeops.app/login` (and localhost for development).
- [ ] **Auth rate limit** raised for the launch burst.
- [ ] Schema applied: `supabase/schema.sql`, or the migrations in order.

## 4. Security posture

Static headers are set in `next.config.ts`: `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`, a closed `Permissions-Policy`, and HSTS. `/auth/*` and `/verify` additionally send `no-referrer` and `no-store`, because those URLs carry sign-in tokens.

**The Content-Security-Policy is built per request in `proxy.ts`** (`lib/csp.ts`), because it carries a nonce. It uses `strict-dynamic`, so the YouTube IFrame API keeps working: Next's own bundles carry the nonce, the player code creates the YouTube script tag, and that script inherits trust without allow-listing Google's hosts. `style-src` keeps `unsafe-inline` — Tailwind emits inline styles for dynamic values and the YouTube iframe injects its own, with no nonce path through either.

After deploying, confirm the policy is live and the player still works:

```bash
curl -sI https://pipeops-learn.pipeops.app/login | grep -i content-security-policy
```

Then open a module page and check the console is free of CSP violations.

Run the adversarial suite against the deployed origin before announcing:

```bash
E2E_BASE_URL=https://pipeops-learn.pipeops.app node scripts/verify-security.mjs
```

58 checks: privilege escalation, cross-participant reads, forged submissions and points, function-privilege probes, forged video progress, unsafe link protocols, admin-RPC abuse, and unauthenticated route protection.

### Function privileges — read this before adding a migration

`supabase/migrations/20260922000026_sec_lockdown_final.sql` revokes EXECUTE from `public`/`anon`/`authenticated` on every project function and grants back an explicit allowlist.

**Re-run it after any migration that creates a function.** It is written to be idempotent. The earlier attempt (…0023) tried to make this automatic with `alter default privileges`; on this project that does not suppress PUBLIC execute, and two migrations added after it shipped functions callable by `anon`. Do not trust the default — re-run the lockdown and let the suite confirm it:

```bash
node scripts/verify-security.mjs   # fails on anything outside the allowlist
```

Two consequences:

- **A new participant-facing RPC needs an explicit `grant execute … to authenticated`** in the lockdown's allowlist, and a matching entry in `EXPECTED_AUTHENTICATED` in `scripts/verify-security.mjs`. Without the grant it is unreachable; without the test entry the suite fails, which is intended.
- **`citext` is deliberately skipped** by the lockdown loop (it is extension-owned) — `users.email` and `enrollments.email` are citext, and revoking `citext_eq` would break every email comparison, which means sign-in.

**Accepted advisor findings.** `citext` stays in `public`. Relocating it means dropping and recreating types two live columns depend on; the fix is riskier than the finding.

## Production address

The app is served at **`https://pipeops-learn.pipeops.app`**. `learn.pipeops.io`
appeared in earlier drafts of these docs, but PipeOps does not own that domain
— it does not resolve — so nothing may point at it. `NEXT_PUBLIC_APP_URL`, the
Supabase Site URL and the redirect allow-list must all use the address above.

### Cloudflare in front of the app

PipeOps serves apps through Cloudflare, and the `pipeops.app` zone has Rocket
Loader enabled. Rocket Loader rewrites every `<script>` tag and the app's CSP
blocks its loader, so before the fix React never started in production: pages
rendered, but the video player, tracking, autosave and admin buttons were
inert. `proxy.ts` now sends `Cache-Control: … no-transform` on every page,
which tells Cloudflare not to rewrite the body. After any deploy, confirm:

```js
// in the browser console on /login — both must be true
[...document.scripts].every((s) => !/-text\/javascript$/.test(s.type || ""))
Object.keys(document.querySelector("input")).some((k) => k.startsWith("__react"))
```

If either is false, ask PipeOps to disable Rocket Loader for this hostname with
a Cloudflare Configuration Rule.

## 5. Launch-day order

1. Apply the schema; confirm `select count(*) from enrollments` matches the accepted list
2. Load video ids and week content; open the weeks that should be open
3. Send yourself a real sign-in email and complete it end to end
4. Run all five verification suites against production
5. **Invite the cohort** from `/admin/invites` → "Invite N people". It emails everyone enrolled who has not signed in, in batches of ten, and asks before sending. It is switched off on any build whose `NEXT_PUBLIC_APP_URL` is localhost, so it only works on the deployed site — and only if that variable is set to `https://pipeops-learn.pipeops.app` there, with no trailing path. The email templates match that exact address to recognise an invite; any other value sends the sign-in email instead. The participant page's "Resend login link" still sends the sign-in email with a code, for anyone who is stuck.
6. Announce

Late joiners are added one at a time from the same page ("Add a participant"), which enrols them, creates their login account and emails them. `scripts/import-participants.mjs` now creates login accounts as well, so a bulk import can no longer leave people unable to sign in.

**Never run `supabase/seed.sql` or `supabase/seed_p2.sql` against the live project.** They are the original development seed. Their upserts reset week release dates — re-locking weeks that are open — and re-insert placeholder resources that point at `https://pipeops.io`. The migrations are the source of truth.

## 6. Rollback

Code rolls back by redeploying the previous image. **The database does not roll back** — migrations are forward-only and several carry data changes. Before any migration touching live cohort data, take a Supabase backup.

If scoring or progress looks wrong, do not patch rows by hand:

```sql
select public.recompute_cohort('<cohort-id>');
```

It rebuilds every derived value from source and is safe to run repeatedly.

## 7. Known gaps at launch

- Transactional email (submission receipts, review outcomes, deadline reminders) is not built. Supabase Auth only sends auth mail. An admin can resend a sign-in email to one participant from their detail page.
- Content is edited through `/admin/content`; there is no bulk import.
- Portal submissions ship **frozen** (`cohorts.submissions_open = false`). Open them from `/admin/content` when ready.
- The leaderboard and sessions ship **hidden** (`leaderboard_visible`, `sessions_visible` = false). Both are built and points accrue regardless; turn either on in `/admin/content`. Sessions can be scheduled in `/admin/sessions` before they are visible.
- Real delivered-email verification is manual by design. `scripts/verify-auth.mjs` mints its own tokens so it can run unattended, which proves the token lifecycle but **not** SMTP, templates or inbox delivery. Before launch, send one to a real mailbox and run `VERIFY_OTP=<code from the email> node scripts/verify-auth.mjs` so the suite checks the code that actually arrived.
- No automated accessibility pass has been run. 44px targets and the 4px grid are followed by construction, but keyboard order, focus restoration after server actions, and screen-reader labels are unverified.
- Uploads are neither resumable nor chunked. This matters when submissions reopen, not before.
- `resendLoginLink` sends real email and has not been fired end to end — exercise it once against a test address before relying on it during the cohort.

## 8. Invite-only, at the Auth API

The app checks `enrollments` before requesting a code, but the anon key reaches the browser, so `signInWithOtp` can be called directly. Close it at the project level:

- [x] Pre-create auth users for the accepted list — `scripts/precreate-auth-users.mjs` (117 active enrolments linked on 23 Sep 2026)
- [x] **Disable new-user signup** in Supabase Auth (verified with an anon-key request returning `signup_disabled` and no Auth user)
- [x] Confirm both OTP and magic link still work for a pre-created user using delivered Gmail SMTP messages
- [x] Re-run `scripts/verify-auth.mjs` with a delivered OTP (14 passed, 0 failed)

Signup was disabled by the project owner on 23 Sep 2026. A direct anon-key request was rejected without creating an Auth user; the real-session auth suite then passed 16/16 checks for a pre-created participant.

Without this a stranger cannot reach cohort data — RLS sees to that — but they can create an orphan `auth.users` row and burn email quota.
