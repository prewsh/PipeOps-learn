import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/StatusMarker";
import { SubmissionForm } from "@/components/SubmissionForm";
import { Card, Meta } from "@/components/ui";
import { getMe } from "@/lib/data/program";
import { externalDestination, getWorkItem } from "@/lib/data/tasks";
import { formatDeadline, formatRelative } from "@/lib/time";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, me] = await Promise.all([getWorkItem(id), getMe()]);

  // Missing, unpublished, or in an unreleased week — indistinguishable by design.
  if (!item || !me) notFound();

  const s = item.submission;
  const status = !s || s.status === "draft" ? "not_started" : s.status;
  const elsewhere = item.externalSubmissionUrl;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>
          {item.type === "program_task" ? "Weekly task" : "Assignment"}
          {item.weekNumber ? ` · Week ${item.weekNumber}` : ""}
          {item.isFinalProject ? " · Final project" : ""}
        </Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          {item.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {elsewhere ? (
            // The platform cannot see a Discord submission, so it must not
            // claim "not started" to someone who has already posted.
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink">
              Submit on {externalDestination(elsewhere)}
            </span>
          ) : (
            <StatusChip status={status} late={s?.isLate} />
          )}
          {item.deadlineAt ? (
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
              Due {formatDeadline(new Date(item.deadlineAt))} ·{" "}
              {formatRelative(new Date(item.deadlineAt))}
            </span>
          ) : null}
        </div>
      </header>

      <Card className="px-5 py-5">
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-base leading-[1.55] text-ink">
          {item.brief}
        </p>
      </Card>

      {s?.status === "needs_revision" && s.reviewNote ? (
        <Card className="px-5 py-4">
          <Meta>Reviewer asked for a revision</Meta>
          <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-[1.55] text-ink">
            {s.reviewNote}
          </p>
        </Card>
      ) : null}

      {elsewhere ? (
        <section>
          <Meta>Submit your task</Meta>
          <Card className="mt-3 px-5 py-5">
            {item.externalSubmissionNote ? (
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-[1.6] text-ink">
                {item.externalSubmissionNote}
              </p>
            ) : null}
            <a
              href={elsewhere}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[16px] font-semibold text-on-ink no-underline hover:bg-ink-hover"
            >
              Open {externalDestination(elsewhere)}
              <span aria-hidden>↗</span>
            </a>
            <p className="mt-3 text-center text-sm text-ink-2">
              Not in the server yet? The same link invites you in.
            </p>
          </Card>
        </section>
      ) : (
        <section>
          <Meta>{s && s.status !== "draft" ? "Your submission" : "Submit"}</Meta>
          <div className="mt-3">
            <SubmissionForm
              item={item}
              enrollmentId={me.enrollmentId}
              submissionsOpen={me.submissionsOpen}
            />
          </div>
        </section>
      )}

      {item.history.length > 0 ? (
        <section>
          <Meta>Earlier versions</Meta>
          <Card className="mt-3 overflow-hidden">
            {item.history.map((v) => (
              <div key={v.id} className="border-b border-line px-5 py-3 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                    Version {v.version}
                    {v.submittedAt ? ` · ${formatDeadline(new Date(v.submittedAt))}` : ""}
                  </span>
                  <StatusChip
                    status={v.status === "draft" ? "not_started" : v.status}
                    late={v.isLate}
                  />
                </div>
                {v.reviewNote ? <p className="mt-2 text-sm text-ink-2">{v.reviewNote}</p> : null}
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <Link href="/tasks" className="text-sm">
        ← All tasks
      </Link>
    </div>
  );
}
