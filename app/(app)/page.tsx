import Link from "next/link";
import { ModuleRow } from "@/components/ModuleRow";
import { StatusChip } from "@/components/StatusMarker";
import { Card, EmptyState, Meta } from "@/components/ui";
import { getAnnouncements } from "@/lib/data/announcements";
import { getMe, getProgramTotals, getWeeks } from "@/lib/data/program";
import { getWorkItems, outstanding } from "@/lib/data/tasks";
import { formatDeadline, formatRelative } from "@/lib/time";

/**
 * Participant dashboard (PRD F9).
 *
 * Block order is fixed and answers "what do I do next?" above the fold on a
 * phone. Desktop keeps the same blocks in the same order but composes them:
 * a two-card hero, then a wide working column beside a narrower reference
 * column. No desktop-only features (docs/DESIGN.md section 6).
 */
export default async function DashboardPage() {
  const [me, weeks, totals, workItems, announcements] = await Promise.all([
    getMe(),
    getWeeks(),
    getProgramTotals(),
    getWorkItems(),
    getAnnouncements(),
  ]);
  if (!me) return null;

  const current = weeks.find((w) => w.state === "current") ?? weeks.find((w) => w.state === "open");
  const released = weeks.filter((w) => w.state !== "locked");
  const { totalItems, completedItems } = totals;

  const latestAnnouncement = announcements[0] ?? null;
  const weeklyTask = workItems.find(
    (i) => i.type === "program_task" && i.weekNumber === current?.number,
  );
  const outstandingWork = outstanding(workItems).filter((i) => i.id !== weeklyTask?.id);

  // Bonus modules are never the prescribed next action — they are optional.
  const nextModule =
    current?.modules.find((m) => !m.isBonus && m.status !== "completed") ??
    released.flatMap((w) => w.modules).find((m) => !m.isBonus && m.status !== "completed");

  const outstandingModules = released
    .filter((w) => current && w.number < current.number)
    .flatMap((w) => w.modules.filter((m) => !m.isBonus && m.status !== "completed"));

  const nextLocked = weeks.find((w) => w.state === "locked");

  return (
    <div className="flex flex-col gap-7">
      <header className="max-w-[46ch]">
        <h1 className="text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-ink md:text-[44px] md:tracking-[-0.035em]">
          Welcome back, {me.name.split(" ")[0]}
        </h1>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          Week {current?.number ?? "—"} of {weeks.length} · {Math.round(me.progressPct)}% ·{" "}
          {completedItems}/{totalItems}
        </p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-ink transition-[width]"
            style={{ width: `${Math.min(me.progressPct, 100)}%` }}
          />
        </div>
      </header>

      {/* Hero — the one dominant action, beside this week's task. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {nextModule ? (
          <div className="flex flex-col rounded-2xl bg-ink px-6 py-6 text-white">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/55">
              ▷ Continue learning
            </p>
            <p className="mt-3 text-[22px] font-bold leading-[1.2] tracking-[-0.018em]">
              {nextModule.code} · {nextModule.title}
            </p>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-white/55">
              {nextModule.resumeAtSeconds > 5
                ? `Resume ${formatClock(nextModule.resumeAtSeconds)}`
                : `${nextModule.estimatedMinutes ?? 0} min`}
            </p>
            <Link
              href={`/learn/module/${nextModule.slug}`}
              className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-white px-5 text-[16px] font-semibold text-ink no-underline hover:bg-fill-subtle"
            >
              {nextModule.resumeAtSeconds > 5 ? "Resume module →" : "Start module →"}
            </Link>
          </div>
        ) : (
          <EmptyState
            title="You're all caught up"
            detail={
              nextLocked
                ? `Week ${nextLocked.number} opens ${formatDeadline(new Date(nextLocked.releaseAt))}.`
                : "You've completed every module in the programme."
            }
          />
        )}

        {weeklyTask ? (
          <div className="flex flex-col rounded-2xl border-2 border-ink bg-surface px-6 py-6">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
                ☑ This week's task
              </p>
              <StatusChip
                status={
                  !weeklyTask.submission || weeklyTask.submission.status === "draft"
                    ? "not_started"
                    : weeklyTask.submission.status
                }
                late={weeklyTask.submission?.isLate}
              />
            </div>
            <p className="mt-3 text-[22px] font-bold leading-[1.2] tracking-[-0.018em] text-ink">
              {weeklyTask.title}
            </p>
            {weeklyTask.deadlineAt ? (
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
                Due {formatDeadline(new Date(weeklyTask.deadlineAt))} ·{" "}
                {formatRelative(new Date(weeklyTask.deadlineAt))}
              </p>
            ) : null}
            <Link
              href={`/tasks/${weeklyTask.id}`}
              className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-ink px-5 text-[16px] font-semibold text-white no-underline hover:bg-ink-surface"
            >
              {me.submissionsOpen ? "Submit task" : "View task"}
            </Link>
          </div>
        ) : current ? (
          <Card className="flex flex-col justify-center px-6 py-6">
            <Meta>This week's task</Meta>
            <p className="mt-2 text-[15px] leading-[1.55] text-ink-2">
              No task set for week {current.number} yet. Focus on the modules — the team will post
              one here when it's ready.
            </p>
          </Card>
        ) : null}
      </div>

      {/* Working column beside a reference column. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start">
        <div className="flex flex-col gap-6">
          {current ? (
            <section>
              <Meta>This week · {current.title}</Meta>
              <Card className="mt-3 overflow-hidden">
                {current.modules.length > 0 ? (
                  current.modules.map((m) => <ModuleRow key={m.id} module={m} />)
                ) : (
                  <p className="px-5 py-6 text-sm text-ink-2">
                    This week's modules are being published.
                  </p>
                )}
              </Card>
            </section>
          ) : null}

          {outstandingWork.length > 0 || outstandingModules.length > 0 ? (
            <section>
              <Meta>Outstanding</Meta>
              <Card className="mt-3 overflow-hidden">
                {outstandingWork.slice(0, 4).map((item) => (
                  <Link
                    key={item.id}
                    href={`/tasks/${item.id}`}
                    className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-2.5 no-underline last:border-b-0 hover:bg-fill-subtle"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">{item.title}</span>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                      Week {item.weekNumber}
                    </span>
                  </Link>
                ))}
                {outstandingModules.slice(0, 4).map((m) => (
                  <Link
                    key={m.id}
                    href={`/learn/module/${m.slug}`}
                    className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-2.5 no-underline last:border-b-0 hover:bg-fill-subtle"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">{m.title}</span>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                      {m.code}
                    </span>
                  </Link>
                ))}
              </Card>
              <p className="mt-2 text-sm text-ink-2">
                These don't block anything — earlier weeks stay open to you.
              </p>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <section>
            <Meta>My programme</Meta>
            <Card className="mt-3 overflow-hidden">
              {weeks.map((w) => (
                <Link
                  key={w.id}
                  href={`/learn/week/${w.number}`}
                  className="flex min-h-12 items-center gap-3 border-b border-line px-5 py-2.5 no-underline last:border-b-0 hover:bg-fill-subtle"
                >
                  <span className="w-9 shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                    W{w.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{w.title}</span>
                  <StatusChip
                    status={
                      w.state === "locked"
                        ? "locked"
                        : w.requiredCount > 0 && w.modulesComplete === w.requiredCount
                          ? "complete"
                          : w.state === "current"
                            ? "in_progress"
                            : "not_started"
                    }
                  />
                </Link>
              ))}
            </Card>
          </section>

          {latestAnnouncement ? (
            <Card className="px-5 py-5">
              <Meta>{latestAnnouncement.isPinned ? "Pinned" : "Latest update"}</Meta>
              <p className="mt-2 text-[17px] font-semibold tracking-[-0.012em] text-ink">
                {latestAnnouncement.title}
              </p>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-[1.55] text-ink-2">
                {latestAnnouncement.body}
              </p>
              <Link href="/announcements" className="mt-3 inline-block text-sm">
                All updates
              </Link>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
