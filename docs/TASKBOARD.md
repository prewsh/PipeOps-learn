# Task board — PipeOps Learn V1

Five prototypes. **Every one is a working, demoable product** — vertical slices,
not layers. No prototype ends with "it'll work once the next bit lands."

Requirement IDs (`F5.6`) refer to `docs/PRD.md`. Design references point at
`docs/DESIGN.md` and the prototypes in `design/`.

| # | Prototype | One-line outcome | Status |
| --- | --- | --- | --- |
| 0 | Scaffold | Repo, tooling, rules, design tokens | ✅ done |
| — | Desktop pass | Rail, hero, module sidebar, admin rail | ✅ done |
| 1 | **Log in and learn** | A participant signs in and completes Week 1 | ✅ done · 22/22 verified |
| 2 | **Submit the work** | Work arrives in the platform, not Discord | ✅ done · 23/23 verified |
| 3 | **Run the cohort** | The team can see and act on cohort health | ✅ done · 18/18 verified |
| 4 | **Motivation loop** | Points, streaks, leaderboard | ✅ built · behind `leaderboard_visible` |
| 5 | **Finish the programme** | Sessions, resources, content editor | ✅ built · sessions behind `sessions_visible` |
| — | Security hardening | Post-audit fixes | ✅ done · 58/58 adversarial checks |

**On P4 and P5.** Both are built and verified. Neither is *visible* to
participants, which is a product decision rather than missing work: the
leaderboard and the sessions list are gated on cohort flags that default to
false (migration …0024). An admin turns either on in `/admin/content` with no
deploy. This row used to read "not started", which made the board lie about
what shipped — the flags exist partly so it cannot happen again.

### Deliberately deferred, and why

| Not built | Reason |
| --- | --- |
| Transactional email (receipts, review outcomes, reminders) | Needs an Edge Function and a provider. Announcements cover the cohort-wide case today. |
| First-login onboarding | Out of the launch scope; `onboarded_at` exists and settings can set it. |
| Resumable upload | Submissions are frozen. Reopen the freeze before this matters. |
| `citext` out of `public` | Two live columns depend on it; the fix is riskier than the finding (migration …0025). |

---

## Sequencing note — the cohort calendar is the deadline

Cohort 01 Week 1 releases **21 Sep 2026**; Week 6 ends **1 Nov 2026**. The
week-gating model means later prototypes can ship *during* the cohort, because
Week 2 content is not needed until 28 Sep and the first submission deadline is
27 Sep.

| Ship by | Prototype | Why that date |
| --- | --- | --- |
| Week 1 release | P1 | Participants cannot start without it |
| Before first deadline (Sun 27 Sep) | P2 | First submissions land that day |
| Week 2 (by 28 Sep) | P3 | First drop-offs become visible and actionable |
| Week 3 (by 5 Oct) | P4 | Motivation matters once the novelty fades |
| Week 5 (by 19 Oct) | P5 | Final project is submitted in Week 6 |

⚠️ **Confirm these dates.** If Cohort 01 really starts 21 Sep 2026, P1 is due
immediately and the rest are genuinely incremental. If the cohort slips, the
whole ladder shifts with it.

---

## Prototype 1 — Log in and learn

**Demo:** *"I get an email, click through, sign in, watch Module 1, and my
progress is still there tomorrow. Week 4 is visibly locked and I cannot reach
its content."*

### Features
- [x] Email-only sign-in against the enrolment list — magic link **and** 6-digit OTP (F1.1–F1.7)
- [x] Rejection message for non-enrolled emails; no public signup route anywhere (F1.4)
- [ ] First-login onboarding: display name, timezone, platforms (F1.10) — **deferred**, out of launch scope
- [ ] Admin CSV import with row-level preview — **partial**: `scripts/import-participants.mjs` does the import, no UI preview
- [x] Six program weeks with automatic date-based unlocking (F3.1–F3.7)
- [x] Locked weeks return number, title and release date **only** — enforced in the query layer (F3.3)
- [x] Module page: video, what you'll learn, materials list, completion control (F4.4)
- [x] YouTube unlisted embed via IFrame Player API (F5.1)
- [x] Video progress: position saved every 15s, resume prompt, `watched_seconds` vs `max_position_seconds`, 90% completion threshold (F5.2–F5.7)
- [x] Graceful degradation — manual completion always available if the player fails (F5.8)
- [x] Mark module complete → module and week progress (F8.1, F8.3)
- [x] Dashboard v1: greeting, week rail, "Continue learning", this week at a glance (F9 blocks 1, 2, 7)
- [x] Learning materials with signed-URL downloads (F6)
- [x] `activity_events` writing from day one (LOGIN, VIDEO_*, MODULE_*, MATERIAL_OPENED)

### Schema
`users` · `cohorts` · `enrollments` · `programs` · `auth_tokens` · `courses` ·
`course_parts` · `modules` · `lessons` · `learning_materials` ·
`program_weeks` · `week_modules` · `video_progress` · `module_progress` ·
`activity_events` — plus RLS on every one.

### Design
Tokens, type scale, mobile tab bar + desktop rail, week card (4 states), module
row, video shell, progress rail, empty states, status markers.

### Exit criteria
`pnpm verify` green · a real participant record completes Week 1 end to end ·
a crafted request for a locked week returns no content · progress survives
logout and a different device.

---

## Prototype 2 — Submit the work

**Demo:** *"I submit a LinkedIn URL, a script file and a reflection. The
deadline passes mid-flow and it is correctly flagged late. An admin asks for a
revision, I resubmit, and both versions are preserved."*

### Features
- [x] Course assignments attached to modules (F7.1)
- [x] Weekly program tasks attached to weeks (F7.1)
- [x] Submission types: URL (one or many), text, file — any combination (F7.2)
- [x] URL validation + allowed-platform warning, non-blocking (F7.3)
- [x] File upload: 25MB, 5 files, extension allowlist, private bucket (F7.4)
- [x] Text draft autosave every 10s and on blur; a draft is not a submission (F7.5)
- [x] Status machine: draft → submitted → under review → approved / needs revision (F7.6)
- [x] `is_late` computed at submit time and frozen on the version (F7.7)
- [x] Resubmission with full version history (F7.8)
- [x] Tasks screen — every assignment and task, grouped by week, with status (F9 §7.1)
- [x] Dashboard "This week's task" block with countdown (F9 block 3)
- [x] Outstanding-from-earlier-weeks block — nudges, never gates (F9 block 4)
- [x] Admin review queue: filters, inline URL/text/file review, keyboard approve/revise (F13.1–F13.3)
- [x] Reviewer feedback visible to the participant (F7.9)
- [x] Email: submission confirmation, review outcome (F18)

### Schema
`assignments` · `program_tasks` · `submissions` · `submission_files`

### Exit criteria
The canonical E2E scenario passes and emits its artifact (see below) · no
double-submit on double-click · deadline change reconciles lateness (F13.5).

---

## Prototype 3 — Run the cohort

**Demo:** *"It's Tuesday of Week 2. In one screen I can see 12 people need
attention, click the tile, get their emails, and send them a nudge."*

### Features
- [x] Admin cohort overview with clickable stat tiles (F11)
- [x] Per-week funnel and module-level completion — where people drop off (F11)
- [x] Participants table: progress, last active, task status, points, filters, sort (F12.1–F12.3)
- [x] Bulk select → copy emails, export CSV, announce to selection (F12.4)
- [x] Participant detail drawer: activity timeline, submissions, versions, ledger, notes (F12.5)
- [x] Enrolment status changes with required reason; resend login link (F12.6)
- [x] Engagement health: active / needs attention / at risk / dormant (F14)
- [x] Progress rollups + the idempotent `recompute(enrollment_id)` routine (F8.6, §11.6)
- [x] Announcements: compose, target, pin, schedule, email-too, read tracking (F15)
- [x] Admin audit log (F13.6)
- [x] Weekly cohort-health digest email to admins (F18)

### Schema
`week_progress` · `announcements` · `announcement_reads` · `audit_log` ·
`email_log` — plus enrolment rollup columns.

### Exit criteria
Health states match hand-computed values on seeded fixtures · every stat tile
deep-links to the correctly filtered list · `recompute` is provably idempotent.

---

## Prototype 4 — Motivation loop

**Demo:** *"I submitted on time, my streak went to 3, I moved from #14 to #11,
and I can see exactly which actions earned the points."*

### Features
- [x] `points_events` append-only ledger with idempotency keys (F10.1, F10.2)
- [x] Scoring rules table implemented exactly as specified (F10)
- [x] Compensating negative rows for revocations — never deletes (F10.3)
- [x] Leaderboard: top 25 + your-position context rows (F10.7)
- [x] "Most Consistent Creator" board (F10.8)
- [x] Personal points breakdown by category (F10.6)
- [x] Streak calculation (§11.4) + dashboard streak block (F9 block 5)
- [x] Rank block on dashboard, "#12 of 87 active creators" (F9 block 6, F10.10)
- [ ] ~~Leaderboard opt-out in settings (F10.9)~~ — **removed**: confusing for something almost nobody would use
- [ ] Deadline reminder emails at 48h and 12h (F18) — **deferred**, needs an email provider

### Schema
`points_events`

### Exit criteria
Recomputation from an empty cache reproduces every total exactly · no
double-award under concurrent submits · ties break per F10.5.

---

## Prototype 5 — Finish the programme

**Demo:** *"I join Blessing's session from the app, watch the replay after,
download the hook library, and submit my final project."*

### Features
- [x] Live sessions: speaker, topic, time, join link revealed at −30min, replay (F16.1–F16.3)
- [x] Attendance marking → points (F16.4)
- [x] Resources library: searchable, tagged, cohort-optional (F17)
- [x] Final project as a Week 6 task with multi-URL + reflection (F7.12)
- [x] Full admin content CRUD: weeks, modules, materials, assignments, tasks (F13.4)
- [ ] Settings: profile and handles ✅; email preferences **deferred** with the email layer
- [x] Announcements list screen; session reminder emails
- [ ] Accessibility pass: 360px, 44px targets, 4.5:1 contrast, keyboard paths — **outstanding**
- [ ] Launch-gate dry run on a `draft` cohort (PRD §13) — **outstanding**

### Schema
`live_sessions` · `session_attendance`

### Exit criteria
The PRD §13 launch gate passes on a draft cohort with two internal accounts.

---

## Testing — what gets tested, and when

Per `AGENTS.md` §10. E2E is the primary mechanism; isolated tests only for
derived-state logic, failure-modes-first, before the code.

### The canonical E2E scenario (built in P2, extended each prototype)

Deliberately medium-hard, not a happy path. One run exercises six invariants:

1. Participant signs in by OTP (not magic link — the harder path)
2. Week 2 is released while Week 4 stays locked; a direct request for Week 4
   content returns nothing
3. Partial video watch → leave → return → resume from saved position
4. Submit URL + text + file together
5. Fixed clock crosses the deadline mid-flow → `is_late` must be true
6. Admin returns `needs_revision` → participant resubmits as v2 → approved
7. Assert: points ledger has no double-award, leaderboard rank is correct,
   progress % rose and never fell

### Artifact contract

Every run writes `e2e/artifacts/<run-id>/`:
`summary.json` (assertions + invariant checks) · Playwright trace ·
screenshots · a dump of derived state (points ledger, progress rollups).
Same seed + same fixed clock ⇒ identical artifact.

### Isolated tests — the only ones permitted

Points scoring · streak · lateness · week state · `recompute()`.
Write the failure list first, then the code, then the tests from that list.
