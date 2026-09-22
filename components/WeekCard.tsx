import Image from "next/image";
import Link from "next/link";
import { StatusChip } from "@/components/StatusMarker";
import { Meta } from "@/components/ui";
import type { Week } from "@/lib/data/program";
import { formatDeadline, formatRelative } from "@/lib/time";

/**
 * Week card (docs/DESIGN.md section 5). Four states: complete · current ·
 * open · locked.
 *
 * A locked card renders number, title and release date only — and the API
 * returns nothing else for it either (PRD F3.3). The cover image is
 * deliberately desaturated while locked so the grid reads at a glance.
 */
export function WeekCard({ week }: { week: Week }) {
  const total = week.requiredCount;
  const complete = total > 0 && week.modulesComplete === total;
  const locked = week.state === "locked";

  const body = (
    <article
      className={`flex h-full flex-col overflow-hidden rounded-2xl border bg-surface transition-colors ${
        week.state === "current" ? "border-ink" : "border-line"
      } ${locked ? "" : "hover:border-ink-3"}`}
    >
      <div className="relative aspect-[16/9] w-full bg-fill-subtle">
        {week.imageUrl ? (
          <Image
            src={week.imageUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className={`object-cover ${locked ? "opacity-35 grayscale" : ""}`}
          />
        ) : null}
        <span className="absolute left-3 top-3 rounded-md bg-surface/95 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-ink backdrop-blur">
          Week {week.number}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <Meta>
            {locked ? "Locked" : week.state === "current" ? "Current" : (week.theme ?? "Open")}
          </Meta>
          <StatusChip
            status={
              locked
                ? "locked"
                : complete
                  ? "complete"
                  : week.modulesComplete > 0
                    ? "in_progress"
                    : "not_started"
            }
          />
        </div>

        <p
          className={`text-[17px] font-semibold leading-[1.25] tracking-[-0.012em] ${
            locked ? "text-ink-3" : "text-ink"
          }`}
        >
          {week.title}
        </p>

        <p className="mt-auto pt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
          {locked
            ? `Opens ${formatDeadline(new Date(week.releaseAt))}`
            : `${week.modulesComplete}/${total} modules${
                week.state === "current"
                  ? ` · due ${formatRelative(new Date(week.deadlineAt))}`
                  : ""
              }`}
        </p>
      </div>
    </article>
  );

  if (locked) return body;

  return (
    <Link href={`/learn/week/${week.number}`} className="block h-full no-underline">
      {body}
    </Link>
  );
}
