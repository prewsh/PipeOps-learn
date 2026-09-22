# Design system — PipeOps Learn

Extracted from the Claude Design handoff bundle in `design/`.
Source of truth: `design/project/Design System.dc.html` (v1.0, 21 Sep 2026).
Tokens are implemented in `app/globals.css`.

> The prototypes in `design/` are **HTML/CSS/JS mockups, not production code**.
> Recreate their visual output in React; do not copy their internal structure.
> `design/project/support.js` is the Claude Design prototype runtime — it is
> **not** a library to port, reimplement or import. Ignore it when building.

---

## The one-line thesis

> One monochrome system for the participant app, the admin console and every
> transactional email. **Status is carried by shape, weight and position —
> never by hue** — so the whole product survives at black, white and grey.

If you find yourself reaching for a colour to express meaning, you have
misunderstood the system.

---

## 1. Colour

| Token | Hex | Use |
| --- | --- | --- |
| `ink` | `#0B0B0C` | Body text, primary buttons, headings |
| `ink-surface` | `#1A1C1F` | Dark cards, video shell, admin rail |
| `ink-2` | `#56585C` | Secondary text, meta, descriptions |
| `ink-3` | `#8A8D93` | Labels, disabled, locked state **only** |
| `line-strong` | `#C9CBCE` | Input borders, progress track |
| `line` | `#E3E4E6` | Card borders, dividers, table rules |
| `fill-subtle` | `#F0F0F1` | Chips, hover rows, inactive tabs |
| `canvas` | `#F6F6F7` | App background behind all cards |
| `surface` | `#FFFFFF` | Cards, sheets, tables, inputs |
| `accent` | `#4F21EA` | **Restricted.** PipeOps brand. Links and the 2px focus ring only. Never a fill, never a status. |

There is no success-green, warning-amber or error-red in this product. An error
is expressed with an `!` glyph, weight and position — see §3.

---

## 2. Type

**Satoshi** carries everything a human wrote. **JetBrains Mono** carries every
number a participant is judged by — deadlines, points, ranks, module codes,
percentages — so data never reads as prose.

| Role | Size | Weight | Tracking | Notes |
| --- | --- | --- | --- | --- |
| display | 44px | 900 | −3.5% | "Week 3 of 6" |
| h1 | 28px | 700 | −2.5% | Screen titles |
| h2 | 20px | 700 | — | Section headings |
| body | 16px | 400 | line-height 1.55 | |
| small | 14px | 400 | — | On `ink-2` |
| label | 12px | 500 | +8%, caps | **Mono.** Deadlines, meta |
| micro | 11px | 400 | +6% | **Mono.** Module codes, durations |

### Floors — hard limits

| Floor | Value |
| --- | --- |
| Text, mobile | 14px |
| Tap target | 44px |
| Layout width | 360px |
| Grid unit | 4px · 8 · 12 · 16 · 24 · 32 · 48 |

### Open question: fonts

The design specifies **Satoshi**, but the prototype's own CSS loads **IBM Plex
Sans/Mono** as a stand-in (Satoshi is not on Google Fonts; it ships via
Fontshare). `app/globals.css` declares the Satoshi/JetBrains Mono stacks with
system fallbacks, but **no webfont is loaded yet**. Before Prototype 1 ships,
confirm with the user: self-host Satoshi, load it from Fontshare, or fall back
to IBM Plex. Do not guess.

---

## 3. Status without colour

Every state is a **6px marker plus a word**:

| Marker | Meaning | Used by |
| --- | --- | --- |
| Filled | Done | Approved, Complete |
| Ring | In flight | Submitted, Under review |
| Hollow | Not started | Not started |
| Hollow + bar | Locked | Locked |
| Half-filled | Attention | Needs revision |
| Slash suffix | Late | Late |

The same chip must work in the mobile app, the admin table **and a plain-text
email**. That constraint is why the system is monochrome.

### Engagement health (PRD F14)

`Active` ≤3d · `Needs attention` 4–6d · `At risk` 7d+ · `Dormant` 14d+

---

## 4. Controls

- **Buttons — one primary per screen.** Primary is `ink` fill. Everything else
  is secondary, tertiary or a link. A disabled/locked button reads as its own
  reason ("Opens 12 October"), not as a greyed-out verb.
- **Admin review actions carry keyboard hints** — `A` approve, `R` request
  revision — because reviewing ~100 submissions a week by mouse is untenable.
- **Inputs** use `line-strong` borders on `surface`, with the 2px `accent`
  focus ring.
- **Textareas** show a live character count against min/max, plus the autosave
  contract: *"Autosaves every 10s and on blur. A draft is not a submission."*
- **Errors** show an `!` glyph and a plain instruction
  ("Enter a full URL starting with https://") — no red.
- **File drop** states its own limits: *"PDF MP4 PNG · max 25MB · up to 5 files"*.

---

## 5. Blocks

| Block | Behaviour |
| --- | --- |
| Programme progress | `45% · 14/30` plus a six-segment week rail marking the current week |
| Week card | Four states: complete · current (with deadline) · open (with outstanding count) · locked |
| Locked week card | Renders number, title and release date **only** — the API returns nothing else (F3.3) |
| Module row | Code, title, duration, and watch state (`WATCHED 100%` / `RESUME 4:12` / `LOCKED · WEEK 4`) |
| Video shell | Dark `ink-surface` frame; YouTube unlisted via IFrame API, `rel=0`, `playsinline`; resume prompt offers "Resume from 4:12" or "Start over" |
| Stat tile (admin) | Big mono number, denominator line, and a `→ filtered list` affordance — every tile clicks through |
| Empty state | Designed, never accidental: *"You're all caught up for Week 3 / Week 4 opens Monday 12 October, 00:00 WAT."* |
| Admin table row | Avatar initials, name, email or risk note, progress, task status, points |

---

## 6. Navigation

- **Mobile:** 5-slot tab bar — Home · Learn · Tasks · Board · More.
  Sessions, Resources, Community and Settings live behind **More**.
- **Desktop:** the same items as a left rail. Desktop is the same app, not a
  different one.

---

## 7. Rules of the system

1. **One dominant action per screen.** If two things look primary, the screen
   has failed.
2. **Deadlines are always double.** Absolute date with an explicit `(WAT)`
   label, plus a relative countdown. Never one without the other.
3. **Nothing blocks, everything nudges.** Outstanding items appear as
   accountability, not gates. Released weeks never re-lock.
4. **Reward behaviour, never reach.** No follower counts, likes or views
   anywhere in the product — not in the ranking, not on a card.
5. **Imagery is a placeholder, not decoration.** Striped grey blocks with a
   mono caption mark where real thumbnails and brand assets drop in.
6. **Accessible at monochrome.** Body text ≥ 4.5:1 on its background. `ink-3`
   (`#8A8D93`) is permitted for 11–12px mono labels and locked states only.

---

## 8. Icons

One geometric line family on a 24px grid: **1.7px stroke, round caps and
joins, `currentColor` only** — an icon inherits the ink of whatever it sits in
and never introduces colour. Never filled, except the play triangle.

Sizes: 19px in navigation · 13–16px inline beside mono labels · 28–30px in
empty states.

Set: HOME · LEARN · TASKS · BOARD · MORE · VIDEO · FOLDER · CHAT · SLIDERS ·
BELL · CLOCK · SPARK · TARGET. Reference render: `design/project/screenshots/icons.png`.

---

## 9. Source files

| File | Contents |
| --- | --- |
| `design/project/Design System.dc.html` | Foundations, components, rules — this document's source |
| `design/project/Participant Screens.dc.html` | Dashboard, week, module, submission, leaderboard. Sections are labelled with PRD requirement IDs (F3, F9). |
| `design/project/Admin Screens.dc.html` | Cohort overview, participants, drawer, review queue, content, tasks, sessions |
| `design/project/Auth and Static.dc.html` | Sign in, check your email, onboarding, public programme page, email set |
| `design/project/PipeOps Learn.dc.html` | Project index |
| `design/project/Developer Handoff.dc.html` | Implementation notes from the designer |
| `design/project/support.js` | Prototype runtime — **ignore, do not port** |
