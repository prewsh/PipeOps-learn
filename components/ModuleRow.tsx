import Link from "next/link";
import { StatusChip } from "@/components/StatusMarker";
import type { ModuleSummary } from "@/lib/data/program";

/** Code, title, duration and watch state (docs/DESIGN.md section 5). */
export function ModuleRow({ module: m }: { module: ModuleSummary }) {
  const watchNote =
    m.status === "completed"
      ? "Complete"
      : m.resumeAtSeconds > 5
        ? `Resume ${formatClock(m.resumeAtSeconds)}`
        : m.percentageWatched > 0
          ? `Watched ${Math.round(m.percentageWatched)}%`
          : "Not started";

  return (
    <Link
      href={`/learn/module/${m.slug}`}
      className="flex min-h-14 items-center gap-4 border-b border-line px-5 py-3 no-underline last:border-b-0 hover:bg-fill-subtle"
    >
      <span className="shrink-0">
        <StatusChip status={m.status === "completed" ? "complete" : m.status} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{m.title}</span>
        <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
          {m.code}
          {m.isBonus ? " · optional" : ""}
          {m.estimatedMinutes ? ` · ${m.estimatedMinutes} min` : ""} · {watchNote}
        </span>
      </span>
    </Link>
  );
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
