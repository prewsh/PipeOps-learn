import { z } from "zod";

/**
 * Validators shared across every write boundary.
 *
 * `z.url()` checks that a string parses as a URL. It does not check the
 * protocol, so `javascript:alert(1)` and `data:text/html,…` both pass it.
 * Submission links, announcement links, resource links and session links are
 * all rendered as anchors — in the review queue an admin clicks them — so the
 * protocol has to be constrained wherever one is accepted.
 *
 * The database enforces the same rule in `public.is_safe_url` (migration
 * …0021). This is the usability layer: it produces a readable message before
 * the round trip. It is not the security boundary, and must never be the only
 * place the rule exists.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export const httpUrl = z
  .string()
  .trim()
  .min(8)
  .max(2000)
  .refine((value) => {
    try {
      return ALLOWED_PROTOCOLS.has(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Links must start with https://");

/** For optional admin fields, where an empty input means "not set". */
export const optionalHttpUrl = z.union([httpUrl, z.literal("")]).optional();

/** Route and form parameters. Never trust a client-supplied id (AGENTS.md §8). */
export const uuid = z.uuid();

/**
 * The email OTP types Supabase will accept at /auth/confirm. Casting the raw
 * query parameter to `EmailOtpType` told TypeScript a lie — the value comes
 * from the address bar.
 */
export const emailOtpType = z.enum([
  "email",
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
]);
