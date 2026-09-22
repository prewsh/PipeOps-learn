import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/StatusMarker";
import { SubmissionForm } from "@/components/SubmissionForm";
import { Card, Meta } from "@/components/ui";
import { getMe } from "@/lib/data/program";
import { getWorkItem } from "@/lib/data/tasks";
import { formatDeadline, formatRelative } from "@/lib/time";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, me] = await Promise.all([getWorkItem(id), getMe()]);

  // Missing, unpublished, or in an unreleased week — indistinguishable by design.
  if (!item || !me) notFound();

  const s = item.submission;
  const status = !s || s.status === "draft" ? "not_started" : s.status;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>
          {item.type === "program_task" ? "Programme task" : "Assignment"}
          {item.weekNumber ? ` · Week ${item.weekNumber}` : ""}
          {item.isFinalProject ? " · Final project" : ""}
        </Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          {item.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusChip status={status} late={s?.isLate} />
          {item.deadlineAt ? (
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
              Due {formatDeadline(new Date(item.deadlineAt))} ·{" "}
              {formatRelative(new Date(item.deadlineAt))}
            </span>
          ) : null}
        </div>
      </header>

      <Card className="px-5 py-5">
        <p className="whitespace-pre-wrap text-base leading-[1.55] text-ink">{item.brief}</p>
      </Card>

      {s?.status === "needs_revision" && s.reviewNote ? (
        <Card className="px-5 py-4">
          <Meta>Reviewer asked for a revision</Meta>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-[1.55] text-ink">
            {s.reviewNote}
          </p>
        </Card>
      ) : null}

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
