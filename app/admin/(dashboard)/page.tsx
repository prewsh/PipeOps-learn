import Link from "next/link";
import { Card, Meta } from "@/components/ui";
import { getCohortStats, getHealthCounts, getReviewQueue, getWeekFunnel } from "@/lib/data/admin";

/**
 * Cohort overview (PRD F11).
 *
 * Every tile clicks through to the filtered list — that click-through is the
 * most-used interaction in the admin product, so no tile is a dead end.
 */
export default async function AdminOverview() {
  const [stats, queue, health, funnel] = await Promise.all([
    getCohortStats(),
    getReviewQueue("pending"),
    getHealthCounts(),
    getWeekFunnel(),
  ]);

  const needsAttention = health.needs_attention + health.at_risk + health.dormant;

  const tiles = [
    {
      label: "Participants",
      value: stats.participants,
      sub: "enrolled and active",
      href: "/admin/participants",
    },
    {
      label: "Need attention",
      value: needsAttention,
      sub: "→ filtered list",
      href: "/admin/participants?health=at_risk",
    },
    {
      label: "Awaiting review",
      value: stats.awaitingReview,
      sub: "→ review queue",
      href: "/admin/submissions",
    },
    {
      label: "Submissions",
      value: stats.totalSubmissions,
      sub: "received to date",
      href: "/admin/submissions?filter=all",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Cohort 01</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          Overview
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="no-underline">
            <Card className="h-full px-4 py-4 transition-colors hover:bg-fill-subtle">
              <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                {t.label}
              </p>
              <p className="mt-2 font-mono text-[32px] leading-none text-ink">{t.value}</p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                {t.sub}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      <section>
        <Meta>Engagement health</Meta>
        <Card className="mt-3 overflow-hidden">
          {(
            [
              ["active", "Active", "≤3d"],
              ["needs_attention", "Needs attention", "4–6d"],
              ["at_risk", "At risk", "7d+"],
              ["dormant", "Dormant", "14d+"],
            ] as const
          ).map(([key, label, window]) => (
            <Link
              key={key}
              href={`/admin/participants?health=${key}`}
              className="flex min-h-12 items-center justify-between gap-4 border-b border-line px-5 py-2.5 no-underline last:border-b-0 hover:bg-fill-subtle"
            >
              <span className="text-[15px] text-ink">{label}</span>
              <span className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  {window}
                </span>
                <span className="w-10 text-right font-mono text-[15px] text-ink">
                  {health[key]}
                </span>
              </span>
            </Link>
          ))}
        </Card>
      </section>

      <section>
        <Meta>Week funnel</Meta>
        <Card className="mt-3 overflow-hidden">
          {funnel.map((w) => (
            <div
              key={w.number}
              className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] text-ink">
                  W{w.number} · {w.title}
                </span>
                <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  {w.released ? "released" : "locked"}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
                {w.started} started · {w.task} task · {w.complete} complete
              </span>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <Meta>Next in the queue</Meta>
        <Card className="mt-3 overflow-hidden">
          {queue.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-2">
              Nothing is waiting for review. The queue is clear.
            </p>
          ) : (
            queue.slice(0, 5).map((q) => (
              <Link
                key={q.submissionId}
                href="/admin/submissions"
                className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-5 py-3 no-underline last:border-b-0 hover:bg-fill-subtle"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-ink">
                    {q.participantName}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                    {q.itemTitle}
                    {q.isLate ? " · late" : ""}
                  </span>
                </span>
              </Link>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
