import Link from "next/link";
import { CohortFlags } from "@/components/admin/CohortFlags";
import { Card, Meta } from "@/components/ui";
import { getContentOverview } from "@/lib/data/admin";
import { formatDeadline } from "@/lib/time";

/** Content editor (PRD F13.4) — the week-level view. */
export default async function ContentPage() {
  const { cohort, weeks } = await getContentOverview();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Content</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[36px]">
          The programme
        </h1>
        <p className="mt-2 max-w-[60ch] text-base leading-[1.55] text-ink-2">
          Edit weeks, modules, tasks and resources. Changes are live immediately — participants see
          them on their next page load.
        </p>
      </header>

      {cohort ? (
        <CohortFlags
          cohortId={cohort.id}
          values={{
            submissions_open: cohort.submissions_open,
            leaderboard_visible: cohort.leaderboard_visible,
            sessions_visible: cohort.sessions_visible,
          }}
        />
      ) : null}

      <Card className="overflow-hidden">
        <div className="hidden border-b border-line bg-fill-subtle px-5 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 md:grid md:grid-cols-[3rem_1fr_9rem_7rem_6rem]">
          <span>Week</span>
          <span>Title</span>
          <span>Opens</span>
          <span className="text-right">Modules</span>
          <span className="text-right">Task</span>
        </div>

        {weeks.map((w) => (
          <Link
            key={w.id}
            href={`/admin/content/${w.number}`}
            className="grid gap-1 border-b border-line px-5 py-3 no-underline last:border-b-0 hover:bg-fill-subtle md:grid-cols-[3rem_1fr_9rem_7rem_6rem] md:items-center md:gap-0"
          >
            <span className="font-mono text-[13px] text-ink-3">W{w.number}</span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-ink">{w.title}</span>
              {w.theme ? (
                <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  {w.theme}
                </span>
              ) : null}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
              {w.released ? "open" : formatDeadline(new Date(w.release_at)).split(",")[0]}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2 md:text-right">
              {w.modules}
              {w.missingVideo > 0 ? ` · ${w.missingVideo} no video` : ""}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 md:text-right">
              {w.hasTask ? "set" : "none"}
            </span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
