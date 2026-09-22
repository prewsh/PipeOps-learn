# 0002 — Passwordless, invite-only authentication

**Status:** Accepted · 21 Sep 2026

## Context

Participants are accepted into a cohort before they ever touch the platform;
we already hold their email addresses. They are mobile-heavy, often on poor
connections, and will not reliably remember a password. We also need certainty
that only accepted participants reach the content.

## Decision

**Email-only sign-in against the enrolment list. Magic link *and* 6-digit OTP
in the same email. No public signup route anywhere in the product.**

The OTP is not a nicety. Magic links break inside in-app browsers — exactly
where creators open email, having arrived from LinkedIn or X — and on shared
devices. Sending both costs one extra line in the template and removes a whole
category of support requests.

## Consequences

- Access control is a data question (is this email enrolled?), not a
  registration flow. Admin controls the cohort by controlling the import.
- No password storage, reset flow, or credential-stuffing surface.
- A participant using a different email than the one imported is a support
  case. Mitigated by an alias email on the enrolment record.
- Rate limiting is essential: 3 requests per email and 10 per IP per 15 minutes
  (F1.7).
- The failure message must not reveal whether an email exists elsewhere in the
  system (F1.4).

## Revisit when

The platform hosts a program with open or paid enrolment, which would need a
genuine registration flow.
