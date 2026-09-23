# PipeOps Learn — Product Requirements Document

**Product:** PipeOps Learn (platform) → first tenant program: **PipeOps UGC Program · Cohort 01**
**Document status:** Draft v1.0 for build
**Date:** 21 September 2026
**Owner:** Precious (precious@pipeops.io)
**Target launch:** Week 1 release date of Cohort 01

---

## 1. Summary

PipeOps Learn is an internal learning and program-operations platform. It delivers a structured multi-week program to an invited cohort of participants, tracks what each participant actually *does* (watch, submit, publish), and gives the program team a single operational dashboard instead of chasing links in Discord.

The first program it runs is the six-week PipeOps UGC Program: a 12-module content-creator course paired with weekly publishing tasks, ending in a final project.

The platform is deliberately built as **program infrastructure**, not a course website, so that Cohort 02, the Campus Ambassador program, HackOps, and customer onboarding courses can run on the same system without a rewrite.

### The product thesis

Not: *watch 12 videos and finish a course.*
But: **Learn → Create → Submit → Publish → Measure → Improve.**

Every design decision in this document is resolved in favour of the participant producing and submitting work.

---

## 2. Problem statement

Running the UGC program without a platform creates four failures:

1. **No single source of truth for work.** ~96 participants send assignment links in Discord threads. Work gets lost, review is manual, nothing is attributable.
2. **No visibility into engagement.** The team cannot answer "who is actually participating?" until it is too late to intervene.
3. **No enforced structure.** Without week gating and deadlines, participants binge or stall; the program loses its cohort rhythm.
4. **Nothing reusable.** Each program becomes a fresh pile of spreadsheets, forms and Discord pins.

---

## 3. Goals, non-goals, success metrics

### 3.1 Goals (V1)

| # | Goal |
|---|------|
| G1 | Every participant always knows exactly what to do next |
| G2 | 100% of program work is submitted through the platform, not Discord |
| G3 | Admin can see cohort health — progress, submissions, at-risk — in one screen without exporting anything |
| G4 | Weekly content releases on schedule with zero manual intervention on release day |
| G5 | Only accepted participants can access content |
| G6 | The platform can host a second program/cohort with configuration only, no code changes |

### 3.2 Non-goals (V1)

Explicitly out of scope. Listed so they do not creep in:

- Chat, forums, DMs, comment threads (Discord remains the community layer)
- Certificates and badges
- AI tutor / AI feedback on submissions
- Peer grading or peer review
- A general-purpose course-authoring WYSIWYG for non-technical admins (V1 authoring is admin CRUD forms)
- Quizzes and graded assessments
- Payments, coupons, public enrollment
- Native mobile apps (the web app must be excellent on mobile, but no app store build)
- Social-platform API integrations to auto-verify posts or pull metrics
- Video hosting migration off YouTube

### 3.3 Success metrics

| Metric | Target for Cohort 01 |
|--------|----------------------|
| Activation — accepted participants who log in at least once in Week 1 | ≥ 85% |
| Weekly active participants (any activity event in a 7-day window) | ≥ 70% through Week 4 |
| Weekly task submission rate | ≥ 60% each week |
| Program completion (all 12 modules + final project submitted) | ≥ 35% |
| Submissions received via Discord instead of platform | ≈ 0 |
| Admin time spent compiling weekly status | < 15 minutes/week |
| Release-day incidents | 0 |

---

## 4. Users

### 4.1 Participant (primary)

A developer or aspiring developer creator accepted into the cohort. Mobile-heavy usage, unreliable connectivity, juggling work or school. Low tolerance for friction; will not remember a password; will not read a long onboarding.

Needs: what do I do this week, where do I submit it, am I behind, am I doing well.

### 4.2 Program admin (primary)

Precious and the PipeOps team. Needs: who's participating, who's slipping, what's waiting for review, who deserves recognition, and end-of-program reporting.

### 4.3 Reviewer (secondary, same surface as admin in V1)

Team member who only reviews submissions. V1 ships a single `admin` role with a `reviewer` role reserved in the schema.

---

## 5. Product concept and naming

| Layer | Name | Purpose |
|-------|------|---------|
| Platform | **PipeOps Learn** | The application. Multi-program, multi-cohort. |
| Program | **PipeOps UGC Program** | A repeatable program definition. |
| Cohort | **Cohort 01 · Sep–Nov 2026** | A dated run of a program with its own participants, schedule and leaderboard. |
| Course | **The Complete UGC Creator Course** | The 12-module curriculum, reusable across cohorts. |

Domain: `learn.pipeops.io`

Participants see program and cohort branding. "PipeOps Learn" is the chrome, not the headline.

---

## 6. Program structure — Cohort 01

Weeks are the primary navigation. Course parts (Creator Mindset & Content Strategy / Content Production / Editing, Publishing & Growth) remain as metadata on modules and appear in the course index, but are not the participant's main path.

| Week | Release | Deadline | Course modules | Weekly task output |
|------|---------|----------|----------------|--------------------|
| 1 | Mon 21 Sep 2026 | Sun 27 Sep 23:59 | M01 Creator Economy · M02 Finding Your Niche | Public commitment post (submitted on Discord) |
| 2 | Mon 28 Sep | Sun 4 Oct 23:59 | M03 Algorithms · M04 Research & Idea Generation | Content research + idea bank |
| 3 | Mon 5 Oct | Sun 11 Oct 23:59 | M05 Planning & Scripting · M06 Hooks | 3 scripts + 5 hooks; publish first dev video |
| 4 | Mon 12 Oct | Sun 18 Oct 23:59 | M07 Filming · M08 Lighting & Audio | Record actual content |
| 5 | Mon 19 Oct | Sun 25 Oct 23:59 | M09 Editing · M10 Captions & Graphics · M10.1 Captions & Graphics Pt 2 | Finished edited content |
| 6 | Mon 26 Oct | Sun 1 Nov 23:59 | M11 Publishing · M12 Growth System · M13 Success Metrics | Publish, analyse, final project |

Six weeks; Weeks 5 and 6 carry three modules each. (A seventh "extra week"
briefly held M12 and Success Metrics; it was folded into Week 6 on 23 Sep 2026
to avoid an extra, confusing week.) Success Metrics is taught content and
counts toward progress like any other module.

Weeks 1–4 were opened early on 23 Sep 2026 so participants can watch ahead.
Opening a week does not move its deadline, and the week the cohort is "on" is
the earliest open week whose work is not yet due — not the most recently
opened one.

All times in **Africa/Lagos (WAT, UTC+1)**. Stored as UTC timestamps, rendered in the cohort timezone.

Each week contains four content slots, any of which may be empty:

1. **Modules** — course lessons (video + materials)
2. **Course assignments** — attached to a module, from the curriculum
3. **Program task** — the weekly UGC task from the PipeOps team (0 or 1 per week in V1; schema allows many)
4. **Week resources** — optional extras from the team; shown only when a week has some. Module material (workbook, key points) lives on the module, not here

---

## 7. Information architecture

### 7.1 Participant navigation

```
Home  |  Learn  |  Tasks  |  Leaderboard  |  Sessions  |  Resources  |  Community ↗
```

| Nav item | Route | Contents |
|----------|-------|----------|
| Home | `/` | Dashboard: next action, week rail, streak, rank, announcements |
| Learn | `/learn` | The 6 weeks → modules. Also a flat course index view. |
| Tasks | `/tasks` | All program tasks + all course assignments, with status |
| Leaderboard | `/leaderboard` | Cohort ranking + personal breakdown |
| Sessions | `/sessions` | Live sessions: speaker, topic, time, join link, replay |
| Resources | `/resources` | Permanent resource library |
| Community | external | Link to Discord `#ugc` (opens in new tab) |

### 7.2 Admin navigation

```
Overview | Participants | Submissions | Content | Tasks | Sessions | Announcements | Leaderboard | Settings
```

Admin lives under `/admin/*`, same app, role-gated.

---

## 8. Feature specifications

Requirement IDs are stable; use them in tickets.

### F1 — Authentication and access control

**Model:** invite-only, passwordless. No public sign-up anywhere in the product.

| ID | Requirement |
|----|-------------|
| F1.1 | Login page asks for email only. |
| F1.2 | On submit, system checks the email against the cohort's enrollment list (case-insensitive, trimmed). |
| F1.3 | If enrolled and status is `active`: send a magic link **and** a 6-digit OTP in the same email. Either works. OTP exists because magic links break inside in-app browsers and on shared devices. |
| F1.4 | If not enrolled: show *"We couldn't find this email in the current PipeOps UGC Program cohort."* plus a contact link. Do not reveal whether the email exists elsewhere in the system. |
| F1.5 | If enrolled but status is `revoked` or `withdrawn`: show a distinct message directing them to the program team. |
| F1.6 | Magic link valid 15 minutes, single use. OTP valid 10 minutes, max 5 attempts, then re-request required. |
| F1.7 | Rate limit: 3 link requests per email per 15 min; 10 per IP per 15 min. |
| F1.8 | Session length 30 days, sliding. No forced re-auth mid-program. |
| F1.9 | Admin access is granted by role on the user record, not by email domain. |
| F1.9a | **Staff sign in at a separate door** (`/admin/login`) using email and password, distinct from the participant flow. Participants remain passwordless: there are ~114 of them, on phones, and a six-week password is a support burden. Staff are few and need reliable repeat access that email deliverability cannot block. The role check runs server-side *after* authentication — a participant with valid credentials is signed straight back out, so this is not a second way into the participant app. |
| F1.10 | First successful login triggers a one-time onboarding: confirm display name, timezone, and the social handles they will publish on. |
| F1.11 | Every login writes a `LOGIN` activity event. |

**Participant import:** admin uploads CSV (`email`, `name`, optional `country`, `primary_platform`, `notes`) → preview with row-level validation → commit. Duplicate emails within a cohort are rejected; the same email may exist in multiple cohorts. Import creates `users` where missing and `enrollments` always.

### F2 — Cohorts and programs

| ID | Requirement |
|----|-------------|
| F2.1 | A cohort has name, program, start date, end date, timezone, status (`draft`/`active`/`completed`/`archived`). |
| F2.2 | A participant's experience is always scoped to exactly one active enrollment in V1. If a user has multiple, the most recently started active cohort is selected; a cohort switcher is deferred. |
| F2.3 | Content (course, modules, materials) is authored once and linked into cohorts, so Cohort 02 reuses Cohort 01's course. |
| F2.4 | Cohort-specific data — week release dates, task deadlines, submissions, progress, points — never crosses cohorts. |
| F2.5 | A `draft` cohort is visible to admins only, enabling a full dry run before release. |

### F3 — Weeks and release scheduling

| ID | Requirement |
|----|-------------|
| F3.1 | Each cohort has N program weeks (6 for Cohort 01) with `release_at` and `deadline_at`. |
| F3.2 | A week is `locked` before `release_at`, `current` between its release and the next week's release, and `open` after that. Locked weeks are computed from timestamps — no cron job, no manual flip. |
| F3.3 | Locked week cards show the title and *"Opens 12 October"* only. Module titles, videos, materials, assignment briefs and task briefs are not returned by the API for locked weeks. |
| F3.4 | **No sequential prerequisite.** Once a week is released, it is accessible regardless of prior-week completion. |
| F3.5 | Released weeks never re-lock, including after `deadline_at` and after the cohort completes. |
| F3.6 | Submissions after `deadline_at` are accepted and flagged `late` (see F7). |
| F3.7 | Admin can change a week's `release_at`/`deadline_at` at any time; effects are immediate. Moving a release earlier is allowed and is the manual "release now" mechanism. |
| F3.8 | Dashboard shows outstanding items from earlier weeks as accountability nudges without blocking access. |

### F4 — Course, modules, lessons

| ID | Requirement |
|----|-------------|
| F4.1 | A course has ordered parts; a part has ordered modules. A module belongs to exactly one week in a given cohort. |
| F4.2 | Module fields: number, title, part, summary, `what_you_will_learn` (list), video reference, estimated minutes, week assignment. |
| F4.3 | V1 treats a module as a single video plus attachments. The `lessons` table exists so a module can later hold multiple lessons; V1 seeds exactly one lesson per module. |
| F4.4 | Everything for a module lives on its page: video, summary, what you'll learn, **its assignment**, and **its resources**. On desktop the assignment and resources sit in a right-hand sidebar; on mobile they stack below. The page carries previous/next module navigation across released weeks, plus a route back to the week. |
| F4.5 | Previous/next navigation moves within the week, then to the next released week. Next into a locked week is disabled with the release date shown. |

### F5 — Video playback and progress

**Decision: YouTube *unlisted* + platform auth wall for V1. Private videos are rejected** — YouTube private sharing is capped at ~50 invited Google accounts and requires each viewer's own Google login, which breaks for ~96 participants and adds an auth dependency we do not control. Unlisted videos are excluded from search and channel listings; the platform is the access-control layer. Accepted risk: a determined participant can share a link. Mitigation deferred to V2 (Mux/Cloudflare Stream signed playback).

| ID | Requirement |
|----|-------------|
| F5.1 | Embed via YouTube IFrame Player API with `rel=0`, `modestbranding`, `playsinline`. |
| F5.2 | On first `PLAYING` event, set `module_started_at` and emit `VIDEO_STARTED`. |
| F5.3 | Persist playback position every 15 seconds while playing, and on pause, tab-hide, and unload. Batch/debounce to avoid write storms. |
| F5.4 | Resume prompt on return: *"Resume from 4:12"* / *"Start over"*. |
| F5.5 | Track `max_position_seconds` (furthest reached) and `watched_seconds` (accumulated, seek-resistant) separately. Percentage watched derives from `watched_seconds / duration`. |
| F5.6 | Video counts as watched at **≥ 90%** of accumulated playback, or on the player's `ENDED` event. Crossing that threshold **completes the module automatically** — completion is earned by watching, not self-declared. Because `watched_seconds` accumulates real playback ticks and ignores seeking, scrubbing to the end does not complete anything. |
| F5.7 | Progress writes are idempotent and monotonic — a later request with a lower position never reduces stored maxima. |
| F5.8 | If the IFrame API fails to load or is blocked, the player degrades to a plain embed and the participant can still mark the module complete manually. Progress tracking must never block completion. |

### F6 — Learning materials

| ID | Requirement |
|----|-------------|
| F6.1 | A material attaches to a module (or to a week, for bonus resources) with type `pdf`, `doc`, `sheet`, `link`, `template`, `video`, `image`. |
| F6.2 | Materials are either an uploaded file in storage or an external URL. |
| F6.3 | Opening or downloading a material emits `MATERIAL_OPENED`. |
| F6.4 | File downloads are served via short-lived signed URLs (15 min), never public bucket paths. |
| F6.5 | Admin can mark a material `required` — required materials appear in the week's outstanding-items list. |

### F7 — Assignments, tasks and submissions

**Portal submissions are currently frozen.** `cohorts.submissions_open` gates
the flow: the form renders a "submissions open soon" state and the server
action refuses. A freeze must be enforced at the API, not by hiding UI, or a
crafted request still writes. The participant-facing section is named
**Weekly task**.

Two distinct objects, one submission engine.

**Course assignment** — attached to a module, from the curriculum. Deadline defaults to the module's week deadline.
**Program task** — attached to a week, authored by the PipeOps team. Has its own deadline and usually requires a public URL.

| ID | Requirement |
|----|-------------|
| F7.1 | Both types define: title, brief (rich text), submission types allowed, deadline, points, required/optional, and optional review requirement. |
| F7.2 | Allowed submission types per item, any combination: `url` (one or many), `text` (with min/max length), `file` (with accepted extensions and max size). At least one must be enabled. |
| F7.3 | URL submissions are validated as absolute http(s) URLs. Program tasks may declare an allowed-platform list (LinkedIn, X, TikTok, Instagram, Facebook, YouTube) and warn — not block — on a non-matching host. |
| F7.4 | File uploads: max 25 MB per file in V1, max 5 files per submission, extension allowlist per item. |
| F7.5 | Draft autosave for text responses every 10 seconds and on blur. A draft is not a submission. |
| F7.6 | Submission statuses: `draft` → `submitted` → (`under_review`) → `approved` \| `needs_revision`. `late` is a boolean flag, not a status. |
| F7.7 | `late = submitted_at > deadline_at`. Late submissions are accepted, visibly flagged to the participant before they submit, and score no on-time bonus. |
| F7.8 | Resubmission is allowed while status is `submitted` or `needs_revision`, and is off by default once `approved`. Each resubmission creates a new version; history is preserved and visible to admin. |
| F7.9 | Participant sees per-item status and, when present, the reviewer's feedback note. |
| F7.10 | Reviewer actions: approve, request revision (feedback required), or leave a note. Rejection is not a terminal state in V1 — `needs_revision` is. |
| F7.11 | Submitting emits `ASSIGNMENT_SUBMITTED` or `TASK_SUBMITTED` and triggers a points recalculation. |
| F7.12 | The Week 6 final project is a program task with `is_final_project = true`; it aggregates the required outputs of the whole program in one brief and permits multiple URLs plus a text reflection. |

### F8 — Progress model

| ID | Requirement |
|----|-------------|
| F8.1 | A module completes automatically at ≥ 90% watched (F5.6). A manual control appears **only** when progress tracking is unavailable — otherwise a participant whose player is blocked could never finish (F5.8). The module page shows watch progress rather than a completion button. |
| F8.2 | A module with a required assignment shows as "complete, 1 assignment outstanding" until the assignment is submitted. Module completion and assignment completion are tracked separately and never conflated. |
| F8.3 | A week is complete when all its modules are complete, all required course assignments are submitted, and the required program task is submitted. |
| F8.4 | **Program completion %** = completed required items ÷ total required items across the entire program (fixed denominator, so the number only rises and is comparable between participants). Items = modules + required course assignments + required program tasks. For Cohort 01: 12 + 12 + 6 = 30 items. |
| F8.5 | The dashboard shows both program completion % and current-week completion. |
| F8.6 | Recomputation happens on write (module complete, submission, points event) and is cached on the enrollment record for fast dashboard and admin-table reads. |

### F9 — Participant dashboard

The single most important screen. It answers "what do I do next?" above the fold, on a phone.

Blocks, in order:

1. **Greeting + position in program** — `Welcome back, Precious · Week 3 of 6 · 45% complete` with a program progress bar.
2. **Continue learning** — the next incomplete module in the current week; falls back to the earliest incomplete module in any released week; falls back to a completion state if nothing is outstanding.
3. **This week's task** — title, deadline with relative countdown ("Due in 3 days"), status chip, primary action (Submit / View submission).
4. **Outstanding from earlier weeks** — a compact list, only when non-empty. Non-blocking.
5. **Streak** — `🔥 3 weeks`.
6. **Position** — `#12 of 87 active creators`, linking to the leaderboard.
7. **This week at a glance** — the week's modules with completion ticks.
8. **Announcements** — latest 2 pinned/unread, dismissible.
9. **Next live session** — when one is scheduled within 7 days.

Rules:
- Exactly one primary CTA is visually dominant.
- Empty and completed states are designed, not accidental: "You're all caught up for Week 3 — Week 4 opens Monday 12 October."
- Streak definition: consecutive weeks in which the participant completed all of that week's modules **and** submitted the program task. Weeks not yet released do not break a streak. A missed week resets to 0. The current, in-flight week counts once its conditions are met.

### F10 — Leaderboard and points

Rewards behaviour, never audience size. No follower counts, likes or views anywhere in the ranking.

| Event | Points | Cap / notes |
|-------|--------|-------------|
| Module completed | +10 | Once per module (12 × 10 = 120) |
| Course assignment submitted | +15 | Once per assignment; not re-awarded on resubmission |
| Submitted before deadline | +5 | Per submission, course assignment or program task |
| Program task submitted | +20 | Once per task |
| Both modules of a week completed | +10 | Once per week |
| Entire week completed (F8.3) | +10 | Once per week |
| Live session attended | +5 | Admin-marked attendance |
| Final project approved | +30 | Once |
| Missed deadline | 0 | No penalty, only the forfeited on-time bonus |

Theoretical max for Cohort 01 ≈ 660 points.

| ID | Requirement |
|----|-------------|
| F10.1 | Points are stored as immutable **ledger rows** (`points_events`), not a mutable total. Totals are summed or cached. |
| F10.2 | A points event is idempotent per (enrollment, rule, target) so recomputation never double-awards. |
| F10.3 | If a submission is later revoked or a module is un-completed, a compensating negative row is written; rows are never deleted. |
| F10.4 | Leaderboard shows rank, display name, points, and a badge for streaks. It does **not** expose other participants' submission contents. |
| F10.5 | Ties break by: earlier timestamp of the last scoring event, then earlier enrollment creation. |
| F10.6 | A participant always sees their own rank and their personal points breakdown by category, whether or not they are in the visible top N. |
| F10.7 | Board shows top 25 plus "your position" context rows (rank−2 … rank+2). |
| F10.8 | A second board, **Most Consistent Creator**, ranks by number of fully completed weeks, then by on-time submission rate. |
| F10.9 | Participants may opt out of appearing on public boards in settings; they still see their own rank, and admin analytics are unaffected. |
| F10.10 | "Active creators" in the `#12 of 87` denominator = enrollments with status `active` and at least one activity event in the last 14 days. |

### F11 — Admin: cohort overview

Landing screen at `/admin`, scoped to the selected cohort.

**Stat tiles**
- Participants (total enrolled)
- Active this week (activity event in last 7 days)
- Completed current week
- Incomplete current week
- Not logged in this week
- Assignments submitted (cohort to date)
- Awaiting review
- Need attention (F14)

Each tile links to the participants table pre-filtered. This is the single most-used interaction in the admin product.

**Secondary panels**
- Per-week funnel: for each week, modules completed / assignments submitted / task submitted, as counts and %
- Module-level completion chart — surfaces where people drop off
- Recent activity feed
- Review queue shortcut

### F12 — Admin: participants

| ID | Requirement |
|----|-------------|
| F12.1 | Table columns: name, email, course progress %, last active, current week task status, assignments submitted (n/total), points, status chip. |
| F12.2 | Filters: week completion, task status, engagement status, review status, opted-out, search by name/email. |
| F12.3 | Sortable by progress, last active, points, submissions. |
| F12.4 | Bulk select → copy emails to clipboard, export CSV, send announcement to selection. |
| F12.5 | Participant detail drawer: timeline of activity events, every submission with version history and inline review controls, per-week progress, points ledger, admin-only notes. |
| F12.6 | Admin can change enrollment status (`active`, `paused`, `withdrawn`, `revoked`) with a required reason, and resend a login link. |
| F12.7 | Full-table CSV export for end-of-program reporting. |

### F13 — Admin: review queue and content management

| ID | Requirement |
|----|-------------|
| F13.1 | Review queue lists pending submissions with filters by week, item, type and lateness; default sort oldest-first. |
| F13.2 | Reviewing shows the submitted URL (with a preview/open action), text, and file downloads inline. |
| F13.3 | Keyboard-driven approve / request-revision to make reviewing ~100 items per week tolerable. |
| F13.4 | Content management is admin CRUD over weeks, modules, materials, assignments and tasks, with a publish/draft flag per item. |
| F13.5 | Changing an item's deadline recomputes lateness and on-time bonuses for existing submissions. |
| F13.6 | Admin actions on content and enrollments are written to an audit log (actor, action, target, before/after, timestamp). |

### F14 — Engagement health and at-risk detection

Computed daily and on activity, so intervention happens in Week 2 rather than Week 5.

| State | Rule |
|-------|------|
| **Active** | Activity event within the last 3 days |
| **Needs attention** | No activity for 4–6 days |
| **At risk** | No activity for 7+ days, **or** 2+ missed required deadlines |
| **Dormant** | No activity for 14+ days, or never logged in after Week 1 release |

| ID | Requirement |
|----|-------------|
| F14.1 | Admin overview shows *"12 participants need attention"* → click-through to the filtered list. |
| F14.2 | Filtered list supports copy-emails and send-announcement-to-selection. |
| F14.3 | Health state is derived from `activity_events`, never hand-edited, and cached on the enrollment. |
| F14.4 | V1 sends no automatic at-risk email to participants — the team decides and sends. Automation is a V2 candidate once the tone is proven. |

### F15 — Announcements

| ID | Requirement |
|----|-------------|
| F15.1 | Admin composes an announcement targeted at: whole cohort, a filtered segment, or a selected list of participants. |
| F15.2 | Fields: title, body (rich text), optional link, pin flag, publish time (now or scheduled), email-too flag. |
| F15.3 | In-app announcements appear on the dashboard and in an announcements list, with read tracking. |
| F15.4 | Weekly release announcements are authored in advance and scheduled to the week's `release_at`. |

### F16 — Live sessions

| ID | Requirement |
|----|-------------|
| F16.1 | A session has speaker name and title, topic, description, start time, duration, join URL, week (optional), replay URL, and attached materials. |
| F16.2 | Sessions list splits upcoming and past; the join link is revealed from 30 minutes before start until 30 minutes after end. |
| F16.3 | Add-to-calendar (.ics) for upcoming sessions. |
| F16.4 | Admin marks attendance manually (paste/select attendees) → emits `SESSION_ATTENDED` and awards points. |
| F16.5 | Replays appear on the session card after the fact and are embedded the same way as module videos. |

### F17 — Resources library

| ID | Requirement |
|----|-------------|
| F17.1 | A permanent, searchable library of resources independent of week gating (templates, hook library, checklists, creator tools, PipeOps brand assets). |
| F17.2 | Resources are tagged and filterable by category; each has title, description, type, and file or link. |
| F17.3 | Resources may optionally be restricted to a cohort; default is available to all participants. |

### F18 — Notifications (email)

Transactional and low-volume. Every email deep-links to the relevant screen.

| Trigger | Recipient | Timing |
|---------|-----------|--------|
| Login link + OTP | Participant | Immediate |
| Welcome / program starting | Participant | On cohort activation |
| New week released | Participant | At `release_at` |
| Task deadline reminder | Participants with the task unsubmitted | 48h and 12h before deadline |
| Submission received (confirmation) | Participant | Immediate |
| Review outcome (approved / needs revision) | Participant | On review |
| Announcement with email-too | Targeted participants | On publish |
| Session starting | Participants | 1h before |
| Weekly digest of cohort health | Admin | Monday morning |

| ID | Requirement |
|----|-------------|
| F18.1 | All outbound email is queued and retried, never sent inline in a request handler. |
| F18.2 | Participants can mute reminder and digest categories; transactional auth and review emails are not mutable. |
| F18.3 | Every send is logged with template, recipient, status and provider id, so the team can prove what went out. |

---

## 9. Key screens

Participant:

| Screen | Route | Notes |
|--------|-------|-------|
| Login | `/login` | Email → OTP/link. Cohort branding. |
| Verify | `/login/verify` | 6-digit entry, resend timer. |
| Onboarding | `/welcome` | Name, timezone, platforms. One time. |
| Dashboard | `/` | F9. |
| Week overview | `/learn/week/[n]` | Modules, assignments, task, bonus resources, week progress. Locked state variant. |
| Course index | `/learn` | Week rail + flat 12-module list grouped by part. |
| Module | `/learn/module/[slug]` | F4.4 layout. |
| Assignment / task detail | `/tasks/[id]` | Brief, submission form, status, history, feedback. |
| Tasks list | `/tasks` | All items, grouped by week, with status chips. |
| Leaderboard | `/leaderboard` | Two boards + personal breakdown. |
| Sessions | `/sessions` | Upcoming and past. |
| Resources | `/resources` | Searchable library. |
| Announcements | `/announcements` | List + detail. |
| Settings | `/settings` | Profile, handles, email preferences, leaderboard opt-out. |

Admin:

| Screen | Route |
|--------|-------|
| Cohort overview | `/admin` |
| Participants + detail drawer | `/admin/participants` |
| Review queue | `/admin/submissions` |
| Content (weeks, modules, materials) | `/admin/content` |
| Tasks & assignments | `/admin/tasks` |
| Sessions | `/admin/sessions` |
| Announcements | `/admin/announcements` |
| Leaderboard config & audit | `/admin/leaderboard` |
| Cohort settings & import | `/admin/settings` |

### 9.1 Design system

The visual and interaction system is specified in **`docs/DESIGN.md`**, extracted
from the Claude Design handoff in `design/`. The PRD governs *what* is built;
the design system governs *how it looks and behaves*. Where they disagree, the
PRD wins on scope and the design system wins on presentation.

The rules that constrain product decisions, not just visuals:

| Rule | Product consequence |
| --- | --- |
| **Monochrome; status by shape, not hue** | Every state is a 6px marker plus a word. The same chip must work in the app, the admin table and a plain-text email — which is why status vocabulary must stay small and nameable. |
| **`#4F21EA` is the only colour** | Restricted to links and the 2px focus ring. There is no success-green or error-red; an error is an `!` glyph and a plain instruction. |
| **One dominant action per screen** | Forces the dashboard's block order (F9) to resolve to a single CTA. |
| **Deadlines are always double** | Absolute date with explicit `(WAT)` plus relative countdown — everywhere a deadline appears. |
| **Mono carries every judged number** | Deadlines, points, ranks, module codes, percentages. Sans carries what a human wrote. |
| **Nothing blocks, everything nudges** | Outstanding items render as accountability, never as gates (F3.4, F3.8). |
| **Reward behaviour, never reach** | No follower counts, likes or views anywhere in the product (F10). |
| **Floors** | 360px layout, 44px tap targets, 14px text, 4px grid. |
| **Every list has a designed empty state** | "No data" is a defect, not a state. |

Navigation is a 5-slot mobile tab bar (Home · Learn · Weekly task · Resources ·
Updates) and the same items as a desktop left rail. **Desktop is the same app,
not a different one**: same components, same order, same copy. The tab bar
becomes a rail carrying the wordmark, the active item as a filled ink pill, and
a footer showing the cohort and current week. No desktop-only features.

Where desktop earns extra width it does so by widening existing blocks, never by
adding new ones: the dashboard's "continue learning" and "this week's task"
become a two-card hero, and the module page moves its assignment and resources
into a right-hand sidebar. The admin console uses the same rail on
`ink-surface`, so the two apps are never confused at a glance.

Screen-level references: `design/project/Participant Screens.dc.html`,
`Admin Screens.dc.html` and `Auth and Static.dc.html`. Those files are
prototypes — recreate their visual output, do not port their structure, and
ignore `support.js` entirely (it is the prototype runtime).

Typeface: **IBM Plex Sans** and **IBM Plex Mono**.

---

## 10. Data model

Postgres. `id` is uuid, all tables carry `created_at`/`updated_at`. Soft delete via `archived_at` where content must survive references.

### Identity and enrollment

**users** — `id`, `email` (unique, lowercased), `name`, `avatar_url`, `timezone`, `role` (`participant`|`reviewer`|`admin`), `socials` (jsonb: platform → handle), `email_prefs` (jsonb), `leaderboard_opt_out` (bool), `onboarded_at`, `last_login_at`

**programs** — `id`, `slug`, `name`, `description`

**cohorts** — `id`, `program_id`, `name`, `code` (e.g. `ugc-01`), `starts_on`, `ends_on`, `timezone`, `status`, `discord_url`, `branding` (jsonb)

**enrollments** — `id`, `cohort_id`, `user_id`, `status` (`active`|`paused`|`withdrawn`|`revoked`), `status_reason`, `enrolled_at`, and cached rollups: `progress_pct`, `points_total`, `streak_weeks`, `weeks_completed`, `health_state`, `last_active_at`. Unique on (`cohort_id`, `user_id`).

**auth_tokens** — `id`, `email`, `code_hash`, `magic_token_hash`, `expires_at`, `consumed_at`, `attempts`, `ip`, `user_agent`

### Content

**courses** — `id`, `slug`, `title`, `description`
**course_parts** — `id`, `course_id`, `order`, `title`
**modules** — `id`, `course_id`, `part_id`, `order`, `number`, `slug`, `title`, `summary`, `what_you_will_learn` (jsonb array), `estimated_minutes`, `status` (`draft`|`published`)
**lessons** — `id`, `module_id`, `order`, `title`, `video_provider` (`youtube`), `video_ref`, `duration_seconds`, `body` (rich text). V1: one per module.
**learning_materials** — `id`, `owner_type` (`module`|`week`|`session`|`library`), `owner_id`, `order`, `title`, `description`, `type`, `url`, `storage_path`, `is_required`, `tags` (text[])

### Program schedule

**program_weeks** — `id`, `cohort_id`, `number`, `title`, `theme`, `release_at`, `deadline_at`, `overview` (rich text). Unique on (`cohort_id`, `number`).
**week_modules** — `id`, `week_id`, `module_id`, `order`. Join table: the same module can sit in different weeks in different cohorts.

### Work

**assignments** — `id`, `module_id`, `cohort_id` (nullable = applies to all cohorts), `title`, `brief`, `submission_types` (jsonb), `text_min`/`text_max`, `file_extensions` (text[]), `max_files`, `is_required`, `requires_review`, `points`, `deadline_at` (nullable → inherits week deadline)

**program_tasks** — `id`, `week_id`, `title`, `brief`, `submission_types` (jsonb), `allowed_platforms` (text[]), `is_required`, `requires_review`, `points`, `deadline_at`, `is_final_project` (bool), `status` (`draft`|`published`)

**submissions** — `id`, `enrollment_id`, `item_type` (`assignment`|`program_task`), `item_id`, `version`, `status` (`draft`|`submitted`|`under_review`|`approved`|`needs_revision`), `is_late`, `urls` (jsonb array), `text_response`, `submitted_at`, `reviewed_at`, `reviewed_by`, `review_note`. Unique on (`enrollment_id`, `item_type`, `item_id`, `version`).

**submission_files** — `id`, `submission_id`, `storage_path`, `filename`, `mime_type`, `size_bytes`

### Progress

**video_progress** — `id`, `enrollment_id`, `lesson_id`, `max_position_seconds`, `watched_seconds`, `duration_seconds`, `percentage_watched`, `started_at`, `completed_at`, `last_seen_at`. Unique on (`enrollment_id`, `lesson_id`).

**module_progress** — `id`, `enrollment_id`, `module_id`, `status` (`not_started`|`in_progress`|`completed`), `started_at`, `completed_at`, `completed_via` (`auto`|`manual`). Unique on (`enrollment_id`, `module_id`).

**week_progress** — `id`, `enrollment_id`, `week_id`, `modules_completed`, `modules_total`, `assignments_submitted`, `assignments_total`, `task_submitted` (bool), `is_complete`, `completed_at`. Derived cache.

### Scoring and telemetry

**points_events** — `id`, `enrollment_id`, `rule` (enum, e.g. `MODULE_COMPLETED`), `target_type`, `target_id`, `points` (signed int), `occurred_at`, `note`. Unique on (`enrollment_id`, `rule`, `target_type`, `target_id`) for idempotency; reversals use a `reversal_of` reference rather than violating the constraint.

**activity_events** — `id`, `enrollment_id`, `user_id`, `type`, `target_type`, `target_id`, `metadata` (jsonb), `occurred_at`. Append-only. Types: `LOGIN`, `VIDEO_STARTED`, `VIDEO_PROGRESS`, `VIDEO_COMPLETED`, `MODULE_STARTED`, `MODULE_COMPLETED`, `MATERIAL_OPENED`, `ASSIGNMENT_STARTED`, `ASSIGNMENT_SUBMITTED`, `TASK_SUBMITTED`, `SUBMISSION_REVIEWED`, `SESSION_ATTENDED`, `ANNOUNCEMENT_READ`, `LEADERBOARD_VIEWED`.

`VIDEO_PROGRESS` is high-volume — write it at most once per module per 60 seconds; the authoritative position lives in `video_progress`, not the event stream.

### Communication

**announcements** — `id`, `cohort_id`, `title`, `body`, `link_url`, `is_pinned`, `publish_at`, `send_email`, `audience` (jsonb: `all` | filter | explicit ids), `created_by`
**announcement_reads** — `announcement_id`, `enrollment_id`, `read_at`
**live_sessions** — `id`, `cohort_id`, `week_id`, `speaker_name`, `speaker_title`, `topic`, `description`, `starts_at`, `duration_minutes`, `join_url`, `replay_url`, `status`
**session_attendance** — `session_id`, `enrollment_id`, `attended`, `marked_by`, `marked_at`
**email_log** — `id`, `user_id`, `template`, `subject`, `status`, `provider_message_id`, `sent_at`, `error`
**audit_log** — `id`, `actor_user_id`, `action`, `target_type`, `target_id`, `before` (jsonb), `after` (jsonb), `occurred_at`

### Access rules (row-level security)

- A participant can read only content belonging to a cohort they are enrolled in, and only weeks where `release_at <= now()`.
- A participant can read and write only their own `submissions`, `video_progress`, `module_progress`, and can read only their own `points_events` and `activity_events`.
- Leaderboard reads go through a view exposing display name, points, streak and rank only — never submissions or emails.
- Admin/reviewer roles bypass cohort scoping for read, and are the only roles permitted to write content, reviews, attendance and announcements.
- Points events and activity events are never writable by a participant client directly; they are written server-side from the action that caused them.

---

## 11. Core business logic

### 11.1 Week state

```
locked   : now < week.release_at
current  : week.release_at <= now < next_week.release_at   (last week: until cohort.ends_on)
open     : now >= next_week.release_at
```

Locked weeks expose only `number`, `title`, `release_at`. Enforced server-side in the query layer, not by hiding UI.

### 11.2 Module completion

Marking is available always; it is *recommended* (button becomes primary, with a hint) once `percentage_watched >= 90`. Completion writes `module_progress.completed_at`, emits `MODULE_COMPLETED`, awards +10 once, then recomputes week and program progress and re-evaluates week bonuses.

### 11.3 Lateness and bonuses

Effective deadline = item deadline, else its week's `deadline_at`. `is_late` is computed at submit time and frozen on that version. Changing an item's deadline recomputes `is_late` and reconciles on-time bonus rows for all affected submissions (F13.5).

### 11.4 Streak

Evaluate weeks in order up to the current week. A week counts if all its modules are complete and its required program task is submitted. Streak = length of the unbroken run ending at the current week (the current week counts as soon as it qualifies; an unqualified current week does not break the streak, it simply is not counted yet).

### 11.5 Health state

`days_since_activity = now - max(activity_events.occurred_at)`; combined with missed required deadlines per F14. Recomputed on every activity write and by a daily job at 06:00 WAT for people whose only change is the passage of time.

### 11.6 Recomputation strategy

All rollups are derivable from the ledger and progress tables. A single idempotent `recompute(enrollment_id)` routine rebuilds `week_progress`, enrollment rollups, and missing points events. It runs on relevant writes and is safe to run in bulk — this is the escape hatch for any scoring or progress bug during the live cohort.

---

## 12. Technical architecture

| Layer | Choice |
|-------|--------|
| App | Next.js (App Router), TypeScript, server components for reads, server actions/route handlers for writes |
| UI | Tailwind + a headless component library; mobile-first |
| Database | Postgres via Supabase, with RLS on every participant-facing table |
| Auth | Supabase Auth — OTP + magic link, email-only |
| Storage | Supabase Storage, private buckets, signed URLs |
| Video | YouTube unlisted + IFrame Player API |
| Email | Resend, queued |
| Scheduled work | Daily health recompute, deadline reminders, scheduled announcements (Supabase scheduled functions or a hosted cron hitting a protected route) |
| Hosting | PipeOps |
| Observability | Error tracking (Sentry), request logs, plus the in-app `activity_events` and `audit_log` |

```
Participant (mobile browser)
        │
        ▼
Next.js on PipeOps ──────► YouTube (unlisted embeds)
        │ ├──────────────► Supabase Auth (OTP / magic link)
        │ ├──────────────► Postgres + RLS
        │ ├──────────────► Supabase Storage (materials, submissions)
        │ └──────────────► Resend (transactional email)
        ▼
Admin dashboard (same app, role-gated)
```

No microservices, no Kubernetes, no queue infrastructure beyond what the platform provides.

**Non-functional targets:** dashboard interactive < 2.5s on 3G/mid-range Android; usable at 360px width; all list endpoints paginated; progress writes debounced; ~100 concurrent participants at release time is the design load (trivial, but release-minute spikes should be cached).

---

## 13. V1 scope

### In scope

1. Email OTP + magic-link login against the accepted-participant list
2. Cohort, enrollment and CSV participant import
3. Six program weeks with automatic date-based unlocking
4. Twelve modules with YouTube embeds and video progress tracking
5. Learning materials on modules and weeks (upload + link)
6. Course assignments
7. Weekly program tasks, including the Week 6 final project
8. URL / text / file submissions with drafts, versions and lateness
9. Module and week progress, program completion %
10. Participant dashboard with next action, streak, rank, outstanding items
11. Admin cohort overview, participants table with detail drawer, review queue
12. Admin content, task, session and announcement management
13. Leaderboard (points + most consistent) with a points ledger
14. Engagement health and at-risk flagging
15. Announcements, in-app and email
16. Live sessions with join links, replays and attendance
17. Resources library
18. Transactional email set (F18)
19. CSV export for end-of-program reporting

### Deferred

V1.1 candidates: automated at-risk emails, certificates, cohort switcher, richer analytics charts, bulk content import, participant profile pages.
V2 candidates: protected video hosting (Mux/Cloudflare Stream), peer review, quizzes, in-app community, AI feedback on submissions, social-platform metric ingestion, a full course-authoring studio, multi-program dashboard for the PipeOps team.

### Build order

| Phase | Deliverable |
|-------|-------------|
| 0 | Schema, RLS, seed of Cohort 01 content, deploy pipeline on PipeOps |
| 1 | Auth + enrollment gate + import, onboarding, app shell |
| 2 | Weeks, unlocking, modules, video progress, materials |
| 3 | Assignments, program tasks, submissions, drafts, lateness |
| 4 | Participant dashboard, progress rollups |
| 5 | Admin overview, participants, review queue, content CRUD |
| 6 | Points ledger, leaderboard, streaks |
| 7 | Announcements, sessions, resources, email set, health/at-risk |
| 8 | Dry run on a `draft` cohort with the team, load/mobile pass, launch |

**Launch gate:** a full dry run on a draft cohort, with two internal accounts completing Week 1 end-to-end — login, watch, submit all three item types, get reviewed, appear correctly on the leaderboard and in the admin table.

---

## 14. Edge cases to handle explicitly

- Participant's email in the import differs from the one they try to log in with → *"not found"* plus a contact route; admin can add an alias email to the enrollment.
- Two people share a device → OTP path must work without a persistent magic-link session; explicit sign-out available.
- Video unavailable / geo-blocked / deleted → module page shows a reportable error state and manual completion stays available.
- Deadline passes mid-submission → lateness is computed at submit time; the form warns before submit that the item is now late.
- Admin moves a week's release date backwards after release → released weeks never re-lock (F3.5); the date change affects display only.
- Participant withdraws mid-program → enrollment `withdrawn`; historical data retained, excluded from active counts and boards.
- Duplicate submission double-click → idempotent submit keyed on (enrollment, item, version).
- File upload fails on a weak connection → resumable or chunked upload with a clear retry; draft text is never lost.
- Cohort timezone vs participant timezone → all deadlines displayed in cohort time with an explicit "(WAT)" label, plus relative countdown.
- A module is reused in Cohort 02 with different content → modules are versioned by cohort linkage; editing shared content warns that it affects other cohorts.

---

## 15. Open decisions needed from you

These do not block starting Phase 0, but each one changes work in Phases 3–6.

1. **Course assignments per module** — one assignment per module (12 total, assumed here), or one per week covering both modules (6 total)?
2. **Program task approval** — does a weekly task need admin approval to score, or is submission enough? (Assumed: submission scores; approval is a quality signal only, except the final project.)
3. **Late submissions after the program ends** — hard cutoff at cohort `ends_on`, or open indefinitely? (Assumed: submissions close at `ends_on` + 7 days.)
4. **Leaderboard visibility** — public to all participants from day one, or revealed from Week 2 to avoid an empty board? (Assumed: visible from day one with a designed empty state.)
5. **Final project scoring** — pass/fail approval, or a rubric score? (Assumed: approval with a feedback note.)
6. **Cohort 01 exact dates** — confirm Week 1 release Mon 21 Sep 2026 and the Sunday 23:59 WAT deadline pattern in §6.
7. **Who reviews** — how many reviewers, and does each reviewer own a slice of participants? (Affects whether the review queue needs assignment.)
8. **Discord linkage** — is Discord membership a requirement we should verify or just link to?
