# Deployment — PipeOps Learn

Target: `learn.pipeops.io` on PipeOps. Supabase project `rxkobtsfvtogswobfdez`.

---

## 1. Environment

Set these on the PipeOps service. Only the first two reach the browser.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Bypasses RLS. Server only — never expose it to the client or a build log. |
| `NEXT_PUBLIC_APP_URL` | `https://learn.pipeops.io` |

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

- [ ] **Custom SMTP** configured (Workspace SMTP or Resend). The built-in sender is rate-limited to a handful an hour and cannot serve 114 people.
- [ ] **Both email templates** updated — "Confirm signup" *and* "Magic Link". Most participants have never signed in, so they hit the signup template. See `docs/email-templates/`.
- [ ] **Site URL** = `https://learn.pipeops.io`.
- [ ] **Redirect allow-list** includes `https://learn.pipeops.io/auth/confirm` (and localhost for development).
- [ ] **Auth rate limit** raised for the launch burst.
- [ ] Schema applied: `supabase/schema.sql`, or the migrations in order.

## 4. Security posture

Static headers are set in `next.config.ts`: `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`, a closed `Permissions-Policy`, and HSTS. `/auth/*` and `/verify` additionally send `no-referrer` and `no-store`, because those URLs carry sign-in tokens.

**The Content-Security-Policy is built per request in `proxy.ts`** (`lib/csp.ts`), because it carries a nonce. It uses `strict-dynamic`, so the YouTube IFrame API keeps working: Next's own bundles carry the nonce, the player code creates the YouTube script tag, and that script inherits trust without allow-listing Google's hosts. `style-src` keeps `unsafe-inline` — Tailwind emits inline styles for dynamic values and the YouTube iframe injects its own, with no nonce path through either.

After deploying, confirm the policy is live and the player still works:

```bash
curl -sI https://learn.pipeops.io/login | grep -i content-security-policy
```

Then open a module page and check the console is free of CSP violations.

Run the adversarial suite against the deployed origin before announcing:

```bash
E2E_BASE_URL=https://learn.pipeops.io node scripts/verify-security.mjs
```

58 checks: privilege escalation, cross-participant reads, forged submissions and points, function-privilege probes, forged video progress, unsafe link protocols, admin-RPC abuse, and unauthenticated route protection.

### Function privileges — read this before adding a migration

`supabase/migrations/20260922000023_sec_privilege_lockdown.sql` revokes EXECUTE from `public`/`anon`/`authenticated` on every project function and grants back an explicit allowlist. It also sets a default privilege so new functions do not inherit PUBLIC execute.

Two consequences:

- **A new participant-facing RPC needs an explicit `grant execute … to authenticated`.** Without one it is unreachable and the feature fails with a permission error.
- **A newly installed extension may need its grants restated**, since the default privilege now revokes. `citext` is deliberately skipped by the lockdown loop (it is extension-owned) — `users.email` and `enrollments.email` are citext, and revoking `citext_eq` would break every email comparison, which means sign-in.

**Accepted advisor findings.** `citext` stays in `public`. Relocating it means dropping and recreating types two live columns depend on; the fix is riskier than the finding.

## 5. Launch-day order

1. Apply the schema; confirm `select count(*) from enrollments` matches the accepted list
2. Load video ids and week content; open the weeks that should be open
3. Send yourself a real sign-in email and complete it end to end
4. Run all five verification suites against production
5. Announce

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
- No automated accessibility pass has been run. 44px targets and the 4px grid are followed by construction, but keyboard order, focus restoration after server actions, and screen-reader labels are unverified.
- Uploads are neither resumable nor chunked. This matters when submissions reopen, not before.
- `resendLoginLink` sends real email and has not been fired end to end — exercise it once against a test address before relying on it during the cohort.

## 8. Invite-only, at the Auth API

The app checks `enrollments` before requesting a code, but the anon key reaches the browser, so `signInWithOtp` can be called directly. Close it at the project level:

- [ ] Pre-create auth users for the accepted list — `scripts/precreate-auth-users.mjs`
- [ ] **Disable new-user signup** in Supabase Auth
- [ ] Confirm both OTP and magic link still work for a pre-created user
- [ ] Re-run `scripts/verify-auth.mjs`

Without this a stranger cannot reach cohort data — RLS sees to that — but they can create an orphan `auth.users` row and burn email quota.
