# AGENTS.md

Working rules for this repository. Applies to every coding agent (Claude Code,
Codex, Cursor, Copilot, …) and is worth reading if you are a human picking this
project up.

This file holds only what you **cannot infer by reading the code**. Feature
requirements live in `docs/PRD.md`; architectural decisions live in
`docs/decisions/`. Do not duplicate either here.

---

## 1. What this is

**PipeOps Learn** is a program-operations and learning platform. Three layers,
and the distinction matters in naming, copy and schema:

- **Platform** — PipeOps Learn. Multi-program, multi-cohort. This repo.
- **Program** — PipeOps UGC Program. A repeatable six-week program definition.
- **Cohort** — Cohort 01 (Sep–Nov 2026). A dated run with its own participants,
  schedule and leaderboard.

It is **not** a course website. The product loop is
**Learn → Create → Submit → Publish → Measure → Improve**. When a design choice
is ambiguous, favour the one that gets the participant to produce and submit work.

Status: prototypes 1-5 built and verified against the live Supabase project.
Five verification suites (`scripts/verify-*.mjs`) cover progress, submissions,
cohort operations, auth and security. `docs/TASKBOARD.md` tracks what is left;
`docs/DEPLOYMENT.md` is the production checklist.

---

## 2. Start here

| If you want to… | Read |
| --- | --- |
| Understand what we are building | `docs/PRD.md` — the full V1 spec |
| Know what to build next | `docs/TASKBOARD.md` — five prototypes, current status |
| Build any UI | `docs/DESIGN.md` — **read before writing a component** |
| Deploy it | `docs/DEPLOYMENT.md` |
| Know why a technology was chosen | `docs/decisions/` |
| Find a specific requirement | PRD requirement IDs, e.g. `F7.6`, `F10.1` |
| Know what must never break | Section 6 below |
| Know how we test | Section 10 below — it is unusual, read it |
| See what is still undecided | PRD section 15 |

Reference requirements by ID in commits, PRs and code comments (`// F5.6`).

---

## 3. Commands

```bash
pnpm install          # install dependencies
pnpm dev              # dev server on http://localhost:3000
pnpm build            # production build
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check .
pnpm format           # biome check --write .
pnpm verify           # typecheck + lint + build — run before saying "done"
pnpm e2e              # playwright end-to-end suite
```

`pnpm verify` is the definition of done for any change. If it fails, the change
is not finished — say so rather than reporting success.

---

## 4. Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router), React, TypeScript strict |
| Styling | Tailwind CSS v4, tokens in `app/globals.css` |
| Lint + format | Biome (not ESLint, not Prettier) |
| Database | Postgres via Supabase, RLS on every participant-facing table |
| Auth | Supabase Auth — email OTP + magic link, invite-only |
| Storage | Supabase Storage, private buckets, signed URLs |
| Video | YouTube unlisted + IFrame Player API (`docs/decisions/0001`) |
| Email | Resend, queued |
| E2E | Playwright |
| Hosting | PipeOps |
| Request gating | `proxy.ts` — `middleware.ts` is deprecated in Next 16 |

Add a dependency only when the code that needs it is being written in the same
change. Prefer platform APIs: `Intl` over a date library, `fetch` over a client,
CSS over a UI kit. An unused dependency is a defect.

---

## 5. Project structure

```
app/                  Next.js App Router — routes, layouts, server actions
  globals.css         Tailwind entry + design tokens (edit tokens, not hex codes)
lib/                  Shared non-UI code
  env.ts              Zod-validated environment. Never read process.env elsewhere.
  time.ts             UTC storage, cohort-timezone rendering
supabase/
  migrations/         Checked-in SQL migrations — the schema source of truth
docs/
  PRD.md              V1 product specification
  TASKBOARD.md        Five prototypes — scope, order, status
  DESIGN.md           Design system — tokens, type, status model, rules
  decisions/          Architecture decision records
design/               Claude Design handoff — HTML prototypes, not code.
                      support.js is the prototype runtime: never port it.
e2e/                  Playwright specs, fixtures and run artifacts
```

Routes are grouped by audience: `(auth)` unauthenticated, `(participant)` the
learner app, `admin/` role-gated. Keep that separation.

---

## 6. Domain invariants — breaking these corrupts live cohort data

These are the rules where reasonable-looking code silently produces wrong
numbers for real participants. Treat them as non-negotiable.

- `points_events` is **append-only**. Never UPDATE or DELETE a row. Reversals
  write a negative row referencing the original. Every insert carries the
  idempotency key (enrollment, rule, target_type, target_id).
- Totals are **derived, never authoritative**. `enrollments.points_total` is a
  cache. If it disagrees with the ledger, the ledger is right.
- Progress % uses a **fixed denominator** (all 30 program items), never
  released-so-far. The number must only ever rise.
- Released weeks **never re-lock**. Moving `release_at` later is display-only.
- Module completion and assignment completion are **separate**. Never collapse
  them into one boolean.
- `watched_seconds` (accumulated) is not `max_position_seconds` (furthest
  reached). Percentage derives from the former. Scrubbing to the end is not
  watching.
- Progress writes are **monotonic** — a lower incoming position never lowers a
  stored maximum.
- `is_late` is computed at submit time and **frozen on that version**. Only the
  deadline-change reconciliation (F13.5) may recompute it.
- Video progress tracking must **never** block completion. If the YouTube
  IFrame API fails, manual completion still works (F5.8).
- All rollups must be rebuildable by `recompute(enrollment_id)`. If you add a
  derived field, extend that routine in the same change.

---

## 7. Security invariants

- **RLS on every participant-facing table.** A new table without a policy is a
  data leak, not a TODO.
- **RLS answers "which rows", never "which columns".** A self-update policy on
  `users` once let a participant set `role = 'admin'` and take over the cohort.
  Privilege-bearing columns (`role`, `email`, `id`) are protected by
  column-level `GRANT` plus a trigger. If you add a sensitive column, protect
  it the same way and add a check to `scripts/verify-security.mjs`.
- **A grant is not an authorisation check.** Postgres gives EXECUTE on every
  new function to PUBLIC, and Supabase exposes `public` over PostgREST, so a
  new function is callable from a browser the moment it exists.
  `compute_health(uuid)` and `compute_streak(uuid)` ran as owner, took a
  caller-supplied enrolment id, and returned a value — any participant could
  read anyone's health and streak. Every function taking an enrolment id now
  calls `assert_enrollment_access()` in its own body. Migration …0023 revokes
  and re-grants an explicit allowlist, and **must stay the last migration in
  that series**: a revoke only covers functions that already exist.
- **Validate where it cannot be skipped.** `submissions.item_id` is polymorphic
  and has no foreign key, and nothing checked it pointed at a real item, so
  `submit_work` with a random UUID minted points. The item, the cohort freeze,
  the accepted submission types and the link protocol are all checked inside
  the RPC. A server action is a usability layer, never the boundary — the same
  reasoning applies to hidden form fields, which is why there are none left.
- **Points and progress count only what joins back to a real item.** See
  `scorable_submissions()`. It deliberately ignores release state: released
  weeks never re-lock, so a schedule edit must not reverse earned points.
- **Watch time is capped by the wall clock.** Duration comes from
  `lessons.duration_seconds`, not the caller, and a delta may not exceed the
  time actually elapsed. `p_ended` lowers the completion bar, it does not set
  it — otherwise one call completes an unwatched video.
- Participants read only their own submissions, progress, points and activity.
- `points_events` and `activity_events` are **server-write-only**. Never expose
  a client path that inserts them.
- Week gating is enforced **in the query layer**, not by hiding UI. A locked
  week must return only number, title and release date — even to a crafted
  request.
- Files are served by **short-lived signed URLs**. Never a public bucket path.
- There is **no public signup route**, ever. Access comes from the cohort
  enrollment list.
- Never log emails, tokens, OTPs or signed URLs.
- The leaderboard exposes display name, points and streak only — never
  submissions or email addresses.

---

## 8. Conventions

- Server Components read; Server Actions and route handlers write. Reach for
  `"use client"` only for genuine interactivity.
- Validate every boundary with Zod — form input, route params, webhooks,
  external responses. Never trust a client-supplied id.
- Timestamps: store UTC, render in the cohort timezone with an explicit `(WAT)`
  label. Use `lib/time.ts`.
- Errors: fail loudly server-side, degrade gracefully client-side. Never
  swallow an error to keep a screen rendering.
- Naming: database `snake_case`, TypeScript `camelCase`, React components
  `PascalCase`, routes `kebab-case`.
- No `any`. No non-null assertions. Both are lint errors.
- Comments explain **why**, never what. Match the density of surrounding code.

---

## 9. UI rules

**Read `docs/DESIGN.md` before writing any component.** The full system —
tokens, type scale, status model, blocks — lives there. The rules that are
easiest to break:

- **The product is monochrome.** `#4F21EA` is the only colour and is restricted
  to links and the 2px focus ring. Never a fill, never a status.
- **Status is carried by shape, weight and position — never by hue.** Every
  state is a 6px marker plus a word: filled = done, ring = in flight, hollow =
  not started, hollow+bar = locked, half = attention, slash = late. The same
  chip must work in a plain-text email.
- **Mobile-first**, 360px floor, 44px tap targets, 14px text floor, 4px grid.
- One visually dominant action per screen.
- Deadlines always render as absolute date with an explicit `(WAT)` label
  **and** a relative countdown. Never one without the other.
- Mono carries every number a participant is judged by — deadlines, points,
  ranks, module codes, percentages. Sans carries what a human wrote.
- Every list has a designed empty state. "No data" is a bug.
- Icons: 24px grid, 1.7px stroke, `currentColor` only, never filled except the
  play triangle.
- Use tokens from `app/globals.css`. Never introduce a raw hex value.
- **Motion has three durations and one easing**, all tokens: `--motion-fast`
  (hover, focus, a marker changing), `--motion-state` (progress, disclosure,
  saved/submitted feedback), `--motion-enter` (one content region arriving).
  Use `.motion-enter` once per screen, never staggered across cards. Never
  animate a deadline, an error or a locked state — motion that delays
  understanding is a defect. `prefers-reduced-motion` is honoured globally in
  `globals.css`, so do not re-implement it per component.
- **Imagery is a placeholder slot, not a brand asset.** Week covers are
  editable per week in `/admin/content`.

## 10. Testing

Tests are a cost. Write few, and make each one earn its place. **Do not bloat
this project with tests nothing needs.**

**E2E is the primary and preferred testing mechanism.** Use Playwright to
verify complex features end to end. Most features need no other test.

**Never write unit tests after writing the code.** A test written afterwards
documents what the code does, not what it should do — that is worthless. If a
system genuinely needs isolated testing, the order is mandatory:

1. Write out every way it could fail.
2. Then write the code.
3. Then the tests, from that failure list.

Never the reverse.

**Choosing E2E scenarios:** do not pick the simplest scenario that proves the
happy path. Pick a medium-to-hard scenario — one with real state, edge timing
and multiple actors.

**Every E2E run produces a verifiable, repeatable artifact** in
`e2e/artifacts/<run-id>/`: `summary.json` (assertions and invariant checks),
the Playwright trace, screenshots, and a dump of derived state (points ledger,
progress rollups). Same seed plus same fixed clock must produce the same
artifact. See `e2e/README.md`.

### Considered harmful — do not write these

- **Tautological tests.** Asserting that a mock returns what you told it to
  return, or restating the implementation as an expectation.
- **Change-detector tests.** Tests that break on any refactor without a
  behaviour change. If renaming a field breaks a test, the test is wrong.
- **Reflexive regression tests for bug fixes.** Add one only when the bug
  revealed a *genuine gap in behaviour coverage*. A fix does not automatically
  earn a test.

### Where isolated tests are justified here

Only derived-state logic, because its bugs are invisible in the UI and corrupt
data silently: points scoring, streak calculation, lateness, week state, and
`recompute(enrollment_id)`. Failure-modes-first, before the code. Nothing else.

---

## 11. Git

- Branch from the default branch; never commit directly to it.
- Commit or push only when explicitly asked.
- **Do not add Claude, Claude Code, Anthropic, or any AI tool as an author,
  co-author or contributor on anything.** No `Co-Authored-By` trailer for a
  bot. No "Generated with …" line in pull request descriptions. No bot
  attribution in commit messages, changelogs or docs. This repository's history
  belongs to its human authors.
- Commit messages: imperative mood, explain why over what. Reference PRD
  requirement IDs where useful (`Add week gating (F3.2, F3.3)`).

---

## 12. Never do this

Out of scope for V1 (PRD section 13.2). Do not add them "while you're in there":

- Chat, forums, DMs or comment threads — Discord is the community layer
- Certificates, badges, quizzes or graded assessments
- AI tutoring or AI feedback on submissions
- Peer grading or peer review
- Payments, coupons or public enrollment
- Social-platform API integrations to verify posts or pull metrics
- A general-purpose course-authoring **studio** — rich-text editing, a media
  library, drag-and-drop curriculum building, versioning, preview. The
  narrow content editor at `/admin/content` (week copy and dates, task
  briefs, video ids, resource links) is in scope and already exists; this
  rule is about not growing it into a CMS.
- YouTube **private** videos — rejected, see `docs/decisions/0001`

Also never: invent participant-facing copy, deadlines or cohort dates; edit a
migration that has already been applied; hardcode a cohort id.

---

## 13. Ask, don't assume

Eight product decisions are still open — PRD section 15. They affect scoring,
review flow and submission windows. If your change depends on one, ask rather
than picking a default and burying it in code.

If you find an instruction here that contradicts `docs/PRD.md`, the PRD wins on
*what* to build and this file wins on *how* to build it. Flag the contradiction.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
