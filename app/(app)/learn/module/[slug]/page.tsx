import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Meta } from "@/components/ui";
import { ModuleCompletion, VideoPlayer } from "@/components/VideoPlayer";
import { startModule } from "@/lib/actions/progress";
import { getMe, getModule, type ModuleDetail } from "@/lib/data/program";
import { formatDeadline, formatRelative } from "@/lib/time";

/**
 * Module page (PRD F4.4).
 *
 * Everything for this module lives here: the video, its assignment, and its
 * resources. Two kinds of document belong to a module and they are kept
 * apart on purpose:
 *
 *   - the workbook IS the assignment, so it is linked from the assignment
 *   - the key-points sheet is the module's resource, so it is listed under
 *     resources, and the assignment points to it
 */
export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [mod, me] = await Promise.all([getModule(slug), getMe()]);

  // Missing, unpublished, or in an unreleased week — indistinguishable by
  // design, because RLS returns nothing for all three (F3.3).
  if (!mod || !me) notFound();

  if (mod.status === "not_started") await startModule(mod.id);

  const keyPoints = mod.materials.find((m) => m.tags.includes("key-points")) ?? null;
  const weekHref = mod.weekNumber ? `/learn/week/${mod.weekNumber}` : "/learn";

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      <div className="min-w-0 flex-1">
        <Link href={weekHref} className="inline-flex min-h-11 items-center gap-2 text-sm">
          <span aria-hidden>←</span>
          {mod.weekNumber ? `Week ${mod.weekNumber}` : "All weeks"}
          {mod.weekTitle ? ` · ${mod.weekTitle}` : ""}
        </Link>

        <header className="mt-2">
          <Meta>
            {mod.code}
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

        {/* Progress sits with the video it measures, not in the navigation. */}
        <div className="mt-3 flex justify-end">
          <ModuleCompletion
            moduleId={mod.id}
            slug={mod.slug}
            complete={mod.status === "completed"}
            percentWatched={mod.percentageWatched}
            trackingUnavailable={!mod.videoRef}
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

        <ModulePager mod={mod} />
      </div>

      {/* Sidebar on desktop, stacked below on mobile. */}
      <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[20rem]">
        {mod.assignment ? (
          <Card className="px-5 py-5">
            <Meta>Assignment</Meta>
            <p className="mt-2 text-[17px] font-semibold tracking-[-0.012em] text-ink">
              {mod.assignment.title}
            </p>
            <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-[1.6] text-ink-2">
              {mod.assignment.brief}
            </p>
            {mod.assignment.deadlineAt ? (
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                Due {formatDeadline(new Date(mod.assignment.deadlineAt))} ·{" "}
                {formatRelative(new Date(mod.assignment.deadlineAt))}
              </p>
            ) : null}

            {mod.assignment.documentUrl ? (
              <a
                href={mod.assignment.documentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-lg border border-line-strong px-4 py-3 no-underline hover:bg-fill-subtle"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-ink">
                    Open the assignment workbook
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                    Classwork + assignment · PDF
                  </span>
                </span>
                <span aria-hidden className="shrink-0 text-ink">
                  ↗
                </span>
              </a>
            ) : null}

            {keyPoints?.url ? (
              <p className="mt-3 text-sm leading-[1.55] text-ink-2">
                Read the{" "}
                <a href={keyPoints.url} target="_blank" rel="noreferrer">
                  {keyPoints.title}
                </a>{" "}
                alongside this — they're also in the resources below.
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

        <div id="resources" className="scroll-mt-24">
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
                    className="flex min-h-12 items-start justify-between gap-3 border-t border-line px-5 py-3 no-underline hover:bg-fill-subtle"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-ink">{m.title}</span>
                      {m.description ? (
                        <span className="mt-0.5 block text-sm leading-[1.5] text-ink-2">
                          {m.description}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                      {m.type}
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
        </div>
      </aside>
    </div>
  );
}

/**
 * Previous and next module, with their names.
 *
 * "← M02 · M04 →" asked people to remember what a code means. Each side now
 * says which module it leads to. On a phone the next module comes first,
 * because moving forward is the common case.
 */
function ModulePager({ mod }: { mod: ModuleDetail }) {
  const card =
    "flex min-h-16 flex-col justify-center gap-1 rounded-xl border bg-surface px-5 py-4 no-underline motion-fast transition-colors hover:bg-fill-subtle";

  return (
    <nav aria-label="Module navigation" className="mt-10 border-t border-line pt-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {mod.prev ? (
          <Link
            href={`/learn/module/${mod.prev.slug}`}
            className={`${card} order-2 border-line sm:order-1`}
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
              ← Previous
            </span>
            <span className="text-[15px] font-medium leading-[1.35] text-ink">
              {mod.prev.code} · {mod.prev.title}
            </span>
          </Link>
        ) : (
          <span className="hidden sm:order-1 sm:block" aria-hidden />
        )}

        {mod.next ? (
          <Link
            href={`/learn/module/${mod.next.slug}`}
            className={`${card} order-1 border-ink text-right sm:order-2`}
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
              Next up →
            </span>
            <span className="text-[15px] font-medium leading-[1.35] text-ink">
              {mod.next.code} · {mod.next.title}
            </span>
          </Link>
        ) : (
          <Link href="/learn" className={`${card} order-1 border-line text-right sm:order-2`}>
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
              That's every open module
            </span>
            <span className="text-[15px] font-medium leading-[1.35] text-ink">All weeks →</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
