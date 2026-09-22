import Link from "next/link";
import { notFound } from "next/navigation";
import { WeekEditor } from "@/components/admin/WeekEditor";
import { Card, Meta } from "@/components/ui";
import { getWeekForEdit } from "@/lib/data/admin";

export default async function WeekEditPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const data = await getWeekForEdit(Number(number));
  if (!data) notFound();

  const { week, modules, task, materials } = data;
  const released = new Date(week.release_at) <= new Date();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/content" className="text-sm">
        ← All weeks
      </Link>

      <header>
        <Meta>Week {week.number}</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[36px]">
          {week.title}
        </h1>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:items-start">
        <WeekEditor week={week} task={task} materials={materials} released={released} />

        <Card className="overflow-hidden">
          <div className="px-5 pt-4">
            <Meta>Modules in this week</Meta>
          </div>
          {modules.length === 0 ? (
            <p className="px-5 py-5 text-sm text-ink-2">No modules assigned to this week.</p>
          ) : (
            <div className="mt-3">
              {modules.map((m) => (
                <Link
                  key={m.id}
                  href={`/admin/content/module/${m.slug}`}
                  className="flex min-h-14 items-center justify-between gap-3 border-t border-line px-5 py-3 no-underline hover:bg-fill-subtle"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-ink">
                      {m.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                      {m.code}
                      {m.minutes ? ` · ${m.minutes} min` : ""}
                      {m.hasVideo ? "" : " · no video"}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-ink-3">
                    →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
