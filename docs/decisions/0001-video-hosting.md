# 0001 — YouTube unlisted for video hosting

**Status:** Accepted · 21 Sep 2026

## Context

The course is 12 videos delivered to ~96 invited participants in Cohort 01.
The videos are not public content and we would prefer they not circulate, but
we are launching on a fixed cohort calendar.

Three options were considered:

1. **YouTube private** — the original plan.
2. **YouTube unlisted** behind our own authentication wall.
3. **Managed video hosting** (Mux, Vimeo, Cloudflare Stream) with signed playback.

## Decision

**YouTube unlisted, with the platform as the access-control layer.**

YouTube private is rejected outright: private sharing is capped at roughly 50
invited Google accounts, requires every viewer to sign in with their own Google
account, and private videos in playlists will not play for anyone not
individually granted access. With ~96 participants that is both over the cap and
an authentication dependency we do not control.

Managed hosting solves protection properly but adds cost, an encoding pipeline
and an integration we do not have time to build before Week 1.

## Consequences

- Unlisted videos are excluded from search and channel listings. Our app's
  auth wall is what actually gates access.
- **Accepted risk:** a determined participant can copy and share a video link.
  We judge this acceptable for a six-week invite-only cohort.
- We use the IFrame Player API for progress tracking, which means progress data
  is ours regardless of the hosting choice (F5.1–F5.7).
- Migration path stays open: swapping to signed playback later changes
  `lessons.video_provider` and the player component, not the progress model.

## Revisit when

Content protection becomes a commercial concern — a paid cohort, licensed
material, or a partner program. Then reopen with Mux or Cloudflare Stream.
