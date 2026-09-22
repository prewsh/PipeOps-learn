import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Meta } from "@/components/ui";
import { ModuleCompletion, VideoPlayer } from "@/components/VideoPlayer";
import { startModule } from "@/lib/actions/progress";
import { getMe, getModule } from "@/lib/data/program";
import { formatDeadline, formatRelative } from "@/lib/time";

/**
 * Module page (PRD F4.4).
 *
 * Everything for this module lives here: the video, its assignment, and its
 * resources. The Resources tab is for extras the team adds for everyone —
 * course material belongs with the course.
 */
export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [mod, me] = await Promise.all([getModule(slug), getMe()]);

  // Missing, unpublished, or in an unreleased week — indistinguishable by
  // design, because RLS returns nothing for all three (F3.3).
  if (!mod || !me) notFound();

  if (mod.status === "not_started") await startModule(mod.id);

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      <div className="min-w-0 flex-1">
        <header>
          <Meta>
            {mod.code}
            {mod.weekNumber ? ` · Week ${mod.weekNumber}` : ""}
            {mod.estimatedMinutes ? ` · ${mod.estimatedMinutes} min` : ""}
          </Meta>
          <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink lg:text-[34px]">
            {mod.title}
          </h1>
        </header>

        <div className="mt-5">
          <VideoPlayer
            moduleId={mod.id}
            slug={mod.slug}
            lessonId={mod.lessonId ?? ""}
            videoRef={mod.videoRef}
            resumeAtSeconds={mod.resumeAtSeconds}
            durationSeconds={mod.durationSeconds}
            alreadyComplete={mod.status === "completed"}
          />
        </div>

        {mod.summary ? (
          <p className="mt-5 text-base leading-[1.55] text-ink-2">{mod.summary}</p>
        ) : null}

        {mod.whatYouWillLearn.length > 0 ? (
          <section className="mt-6">
            <Meta>What you'll learn</Meta>
            <ul className="mt-3 flex flex-col gap-2">
              {mod.whatYouWillLearn.map((item) => (
                <li key={item} className="flex gap-3 text-[15px] leading-[1.5] text-ink">
                  <span
                    className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ink"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Prev / next within released weeks, plus the route back to the week. */}
        <nav className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <div className="flex flex-wrap items-center gap-3">
            {mod.prev ? (
              <Link
                href={`/learn/module/${mod.prev.slug}`}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[15px] text-ink no-underline hover:bg-fill-subtle"
              >
                <span aria-hidden>←</span>
                <span className="max-w-[9rem] truncate">{mod.prev.code}</span>
              </Link>
            ) : null}
            {mod.next ? (
              <Link
                href={`/learn/module/${mod.next.slug}`}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[15px] text-ink no-underline hover:bg-fill-subtle"
              >
                <span className="max-w-[9rem] truncate">{mod.next.code}</span>
                <span aria-hidden>→</span>
              </Link>
            ) : null}
            <Link
              href={mod.weekNumber ? `/learn/week/${mod.weekNumber}` : "/learn"}
              className="text-sm"
            >
              Back to week
            </Link>
          </div>

          <ModuleCompletion
            moduleId={mod.id}
            slug={mod.slug}
            complete={mod.status === "completed"}
            percentWatched={mod.percentageWatched}
            trackingUnavailable={!mod.videoRef}
          />
        </nav>
      </div>

      {/* Sidebar on desktop, stacked below on mobile. */}
      <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[19rem]">
        {mod.assignment ? (
          <Card className="px-5 py-5">
            <Meta>Assignment</Meta>
            <p className="mt-2 text-[17px] font-semibold tracking-[-0.012em] text-ink">
              {mod.assignment.title}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-[1.6] text-ink-2">
              {mod.assignment.brief}
            </p>
            {mod.assignment.deadlineAt ? (
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                Due {formatDeadline(new Date(mod.assignment.deadlineAt))} ·{" "}
                {formatRelative(new Date(mod.assignment.deadlineAt))}
              </p>
            ) : null}
            <p className="mt-4 border-t border-line pt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
              {me.submissionsOpen
                ? mod.assignment.submitted
                  ? "Submitted"
                  : "Submit from Weekly task"
                : "Submissions open soon"}
            </p>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <div className="px-5 pt-4">
            <Meta>Resources for this module</Meta>
          </div>
          {mod.materials.length > 0 ? (
            <div className="mt-3">
              {mod.materials.map((m) => (
                <a
                  key={m.id}
                  href={m.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-12 items-center justify-between gap-3 border-t border-line px-5 py-3 no-underline hover:bg-fill-subtle"
                >
                  <span className="min-w-0 truncate text-[15px] text-ink">{m.title}</span>
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                    {m.isRequired ? "Required" : m.type}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="px-5 py-4 text-sm text-ink-2">
              No extra material for this module — the video covers it.
            </p>
          )}
        </Card>
      </aside>
    </div>
  );
}
