import Link from "next/link";
import { CopyEmails } from "@/components/CopyEmails";
import { Card, EmptyState, Meta } from "@/components/ui";
import { getParticipants, type HealthState } from "@/lib/data/admin";
import { formatRelative } from "@/lib/time";

const HEALTH_LABEL: Record<HealthState, string> = {
  active: "Active",
  needs_attention: "Needs attention",
  at_risk: "At risk",
  dormant: "Dormant",
};

/** Participants table (PRD F12). Filters are URL state so views are shareable. */
export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<{ health?: string; q?: string; task?: string }>;
}) {
  const { health, q, task } = await searchParams;

  const participants = await getParticipants({
    health: health as HealthState | undefined,
    q,
    task: task as "missing" | "submitted" | undefined,
  });

  const filters = [
    { label: "All", href: "/admin/participants", active: !health && !task },
    {
      label: "Needs attention",
      href: "/admin/participants?health=needs_attention",
      active: health === "needs_attention",
    },
    { label: "At risk", href: "/admin/participants?health=at_risk", active: health === "at_risk" },
    { label: "Dormant", href: "/admin/participants?health=dormant", active: health === "dormant" },
    { label: "Task missing", href: "/admin/participants?task=missing", active: task === "missing" },
  ];

  const exportHref = `/admin/participants/export${health ? `?health=${health}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Meta>Participants</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          {participants.length} shown
        </h1>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={f.href}
            className={`font-mono text-[11px] uppercase tracking-[0.06em] no-underline ${
              f.active ? "text-ink" : "text-ink-3 hover:text-ink"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-4">
          <CopyEmails emails={participants.map((p) => p.email)} />
          <a
            href={exportHref}
            className="font-mono text-[11px] uppercase tracking-[0.06em] no-underline"
          >
            Export CSV
          </a>
        </span>
      </div>

      {participants.length === 0 ? (
        <EmptyState title="Nobody matches that filter" detail="Try a wider view." />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden border-b border-line bg-fill-subtle px-5 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 md:grid md:grid-cols-[1fr_90px_80px_90px_110px]">
            <span>Participant</span>
            <span className="text-right">Progress</span>
            <span className="text-right">Subs</span>
            <span className="text-right">W1 task</span>
            <span className="text-right">Last active</span>
          </div>

          {participants.map((p) => (
            <Link
              key={p.enrollmentId}
              href={`/admin/participants/${p.enrollmentId}`}
              className="grid grid-cols-1 gap-1 border-b border-line px-5 py-3 no-underline last:border-b-0 hover:bg-fill-subtle md:grid-cols-[1fr_90px_80px_90px_110px] md:items-center md:gap-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-ink">{p.name}</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  {p.health === "active" ? p.email : `${HEALTH_LABEL[p.health]} · ${p.email}`}
                </span>
              </span>
              <span className="font-mono text-[13px] text-ink md:text-right">
                {Math.round(p.progressPct)}%
              </span>
              <span className="font-mono text-[13px] text-ink-2 md:text-right">
                {p.submissionCount}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2 md:text-right">
                {p.currentWeekTask === "submitted" ? "Submitted" : "Missing"}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 md:text-right">
                {p.lastActiveAt ? formatRelative(new Date(p.lastActiveAt)) : "never"}
              </span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
