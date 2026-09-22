import { notFound } from "next/navigation";
import { ModuleRow } from "@/components/ModuleRow";
import { Card, EmptyState, Meta } from "@/components/ui";
import { getWeekMaterials, getWeeks } from "@/lib/data/program";
import { formatDeadline, formatRelative } from "@/lib/time";

export default async function WeekPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const weeks = await getWeeks();
  const week = weeks.find((w) => String(w.number) === number);

  if (!week) notFound();

  // A locked week renders its number, title and release date. Nothing else
  // exists to render — RLS returns no modules or materials for it (F3.3).
  if (week.state === "locked") {
    return (
      <div className="flex flex-col gap-5">
        <Meta>Week {week.number} · Locked</Meta>
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink-3">
          {week.title}
        </h1>
        <EmptyState
          title={`Opens ${formatDeadline(new Date(week.releaseAt))}`}
          detail={`That's ${formatRelative(new Date(week.releaseAt))}. Everything inside becomes available automatically.`}
        />
      </div>
    );
  }

  const materials = await getWeekMaterials(week.id);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>
          Week {week.number} of {weeks.length}
          {week.theme ? ` · ${week.theme}` : ""}
        </Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          {week.title}
        </h1>
        {week.overview ? (
          <p className="mt-3 text-base leading-[1.55] text-ink-2">{week.overview}</p>
        ) : null}
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
          Due {formatDeadline(new Date(week.deadlineAt))} ·{" "}
          {formatRelative(new Date(week.deadlineAt))}
        </p>
      </header>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <Meta>Modules</Meta>
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
            {week.modulesComplete}/{week.requiredCount} done
          </span>
        </div>
        <Card className="mt-3 overflow-hidden">
          {week.modules.length > 0 ? (
            week.modules.map((m) => <ModuleRow key={m.id} module={m} />)
          ) : (
            <p className="px-5 py-6 text-sm text-ink-2">
              Modules for this week are being published.
            </p>
          )}
        </Card>
      </section>

      <section>
        <Meta>Bonus resources</Meta>
        {materials.length > 0 ? (
          <Card className="mt-3 overflow-hidden">
            {materials.map((m) => (
              <a
                key={m.id}
                href={m.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-5 py-3 no-underline last:border-b-0 hover:bg-fill-subtle"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-ink">{m.title}</span>
                  {m.description ? (
                    <span className="mt-0.5 block truncate text-sm text-ink-2">
                      {m.description}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  {m.type}
                </span>
              </a>
            ))}
          </Card>
        ) : (
          <div className="mt-3">
            <EmptyState title="No bonus resources for this week yet" />
          </div>
        )}
      </section>
    </div>
  );
}
