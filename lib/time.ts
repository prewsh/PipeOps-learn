/**
 * Time handling.
 *
 * Rule: timestamps are stored in UTC and rendered in the cohort's timezone.
 * Never format a deadline with the viewer's local timezone — a participant in
 * London and one in Lagos must see the same deadline (PRD section 6).
 *
 * Uses the platform Intl API; no date library.
 */

/** Cohort 01 runs on West Africa Time. Cohorts carry their own tz in Stage B. */
export const DEFAULT_COHORT_TIMEZONE = "Africa/Lagos";

/**
 * Zone abbreviation. Intl renders Africa/Lagos as "GMT+1", but the design
 * system requires the named zone participants actually say (docs/DESIGN.md
 * section 7, rule 2).
 */
const ZONE_LABELS: Record<string, string> = {
  "Africa/Lagos": "WAT",
};

function zoneLabel(timeZone: string, at: Date): string {
  const named = ZONE_LABELS[timeZone];
  if (named) return named;

  return (
    new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone
  );
}

/** e.g. "Sun 27 Sep, 11:59 PM (WAT)" */
export function formatDeadline(at: Date, timeZone: string = DEFAULT_COHORT_TIMEZONE): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);

  return `${formatted} (${zoneLabel(timeZone, at)})`;
}

/**
 * Relative countdown shown next to every deadline, e.g. "in 3 days", "2 hours ago".
 * Deadlines always render as absolute date AND relative time (AGENTS.md UI rules).
 */
export function formatRelative(at: Date, now: Date = new Date()): string {
  const diffMs = at.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];

  for (const [unit, ms] of units) {
    const value = Math.trunc(diffMs / ms);
    if (value !== 0) return rtf.format(value, unit);
  }
  return "now";
}
