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

Headers are set in `next.config.ts`: `X-Frame-Options: DENY` plus `frame-ancestors 'none'`, `nosniff`, `strict-origin-when-cross-origin`, a closed `Permissions-Policy`, and HSTS. `/auth/*` and `/verify` additionally send `no-referrer` and `no-store`, because those URLs carry sign-in tokens.

**No Content-Security-Policy beyond `frame-ancestors` yet.** The YouTube IFrame API injects inline script and style, so a real policy needs nonces threaded through the player. Adding one carelessly either breaks playback or is loose enough to be pointless. Tracked as the top post-launch security item.

Run the adversarial suite against the deployed origin before announcing:

```bash
E2E_BASE_URL=https://learn.pipeops.io node scripts/verify-security.mjs
```

34 checks: privilege escalation, cross-participant reads, forged points and activity, admin-RPC abuse, and unauthenticated route protection.

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

- Transactional email (submission receipts, review outcomes, deadline reminders) is not built. Supabase Auth only sends auth mail.
- Content is edited through `/admin/content`; there is no bulk import.
- Portal submissions ship **frozen** (`cohorts.submissions_open = false`). Open them from `/admin/content` when ready.
