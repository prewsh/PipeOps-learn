import Link from "next/link";
import { ReviewActions } from "@/components/ReviewActions";
import { StatusChip } from "@/components/StatusMarker";
import { Card, EmptyState, Meta } from "@/components/ui";
import { getReviewQueue } from "@/lib/data/admin";
import { formatDeadline } from "@/lib/time";

/** Review queue (PRD F13.1). Oldest first — longest wait is reviewed first. */
export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const showAll = filter === "all";
  const queue = await getReviewQueue(showAll ? "all" : "pending");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Review queue</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          {queue.length} {showAll ? "submissions" : "awaiting review"}
        </h1>
        <div className="mt-3 flex gap-4">
          <Link
            href="/admin/submissions"
            className={`font-mono text-[11px] uppercase tracking-[0.06em] no-underline ${showAll ? "text-ink-3" : "text-ink"}`}
          >
            Pending
          </Link>
          <Link
            href="/admin/submissions?filter=all"
            className={`font-mono text-[11px] uppercase tracking-[0.06em] no-underline ${showAll ? "text-ink" : "text-ink-3"}`}
          >
            All
          </Link>
        </div>
      </header>

      {queue.length === 0 ? (
        <EmptyState title="The queue is clear" detail="Nothing is waiting for review right now." />
      ) : (
        queue.map((q, i) => (
          <Card key={q.submissionId} className="px-5 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] font-semibold tracking-[-0.012em] text-ink">
                  {q.participantName}
                </p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 [overflow-wrap:anywhere]">
                  {q.participantEmail}
                </p>
              </div>
              <StatusChip
                status={q.status as "submitted" | "under_review" | "approved" | "needs_revision"}
                late={q.isLate}
              />
            </div>

            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
              {q.itemType === "program_task" ? "Programme task" : "Assignment"}
              {q.weekNumber ? ` · Week ${q.weekNumber}` : ""} · v{q.version}
              {q.submittedAt ? ` · ${formatDeadline(new Date(q.submittedAt))}` : ""}
            </p>
            <p className="mt-1 text-[15px] font-medium text-ink">{q.itemTitle}</p>

            {q.urls.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1">
                {q.urls.map((u) => (
                  <li key={u}>
                    <a href={u} target="_blank" rel="noreferrer" className="break-all text-sm">
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            {q.textResponse ? (
              <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-fill-subtle p-4 text-[15px] leading-[1.55] text-ink">
                {q.textResponse}
              </p>
            ) : null}

            {q.files.length > 0 ? (
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                {q.files.length} attachment{q.files.length === 1 ? "" : "s"}:{" "}
                {q.files.map((f) => f.filename).join(", ")}
              </p>
            ) : null}

            {q.reviewNote ? (
              <p className="mt-3 border-t border-line pt-3 text-sm text-ink-2">{q.reviewNote}</p>
            ) : null}

            {q.status === "submitted" || q.status === "under_review" ? (
              <div className="mt-4 border-t border-line pt-4">
                <ReviewActions submissionId={q.submissionId} focused={i === 0} />
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );
}
