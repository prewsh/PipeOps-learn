import Link from "next/link";
import { StatusChip } from "@/components/StatusMarker";
import { Card, EmptyState, Meta } from "@/components/ui";
import { getWorkItems, type WorkItem } from "@/lib/data/tasks";
import { formatDeadline, formatRelative } from "@/lib/time";

/** Every assignment and programme task, grouped by week (PRD F9 section 7.1). */
export default async function TasksPage() {
  const items = await getWorkItems();

  const byWeek = new Map<number, WorkItem[]>();
  for (const item of items) {
    const key = item.weekNumber ?? 0;
    byWeek.set(key, [...(byWeek.get(key) ?? []), item]);
  }

  const done = items.filter((i) => i.submission && i.submission.status !== "draft").length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Weekly task</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          Your weekly work
        </h1>
        <p className="mt-2 text-base leading-[1.55] text-ink-2">
          Your task and assignment for each week. {done} of {items.length} submitted.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          detail="Assignments and weekly tasks appear as each week is released."
        />
      ) : (
        [...byWeek.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([week, weekItems]) => (
            <section key={week}>
              <Meta>Week {week}</Meta>
              <Card className="mt-3 overflow-hidden">
                {weekItems.map((item) => (
                  <TaskRow key={item.id} item={item} />
                ))}
              </Card>
            </section>
          ))
      )}
    </div>
  );
}

function TaskRow({ item }: { item: WorkItem }) {
  const s = item.submission;
  const status = !s || s.status === "draft" ? "not_started" : s.status;

  return (
    <Link
      href={`/tasks/${item.id}`}
      className="flex min-h-16 items-center gap-4 border-b border-line px-5 py-3 no-underline last:border-b-0 hover:bg-fill-subtle"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{item.title}</span>
        <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
          {item.type === "program_task" ? "Programme task" : "Assignment"}
          {item.deadlineAt
            ? ` · due ${formatDeadline(new Date(item.deadlineAt))} · ${formatRelative(new Date(item.deadlineAt))}`
            : ""}
        </span>
      </span>
      <span className="shrink-0">
        <StatusChip status={status} late={s?.isLate} />
      </span>
    </Link>
  );
}
