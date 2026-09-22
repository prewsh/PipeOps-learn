import Link from "next/link";
import { notFound } from "next/navigation";
import { ParticipantAdminControls } from "@/components/ParticipantAdminControls";
import { StatusChip } from "@/components/StatusMarker";
import { Card, Meta, ProgressBar } from "@/components/ui";
import { getParticipantDetail } from "@/lib/data/admin";
import { formatDeadline, formatRelative } from "@/lib/time";

/** Participant drawer, as a page (PRD F12.5). */
export default async function ParticipantDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getParticipantDetail(id);
  if (!detail) notFound();

  const { enrollment: e, activity, submissions, weeks } = detail;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/participants" className="text-sm">
        ← All participants
      </Link>

      <header>
        <Meta>
          {e.health.replace("_", " ")} · {e.status}
        </Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          {e.name ?? e.email}
        </h1>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
          {e.email} · enrolled {formatDeadline(new Date(e.enrolled_at))} · last active{" "}
          {e.last_active_at ? formatRelative(new Date(e.last_active_at)) : "never"}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar pct={Number(e.progress_pct)} />
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
            {Math.round(Number(e.progress_pct))}%
          </span>
        </div>
      </header>

      <section>
        <Meta>Week by week</Meta>
        <Card className="mt-3 overflow-hidden">
          {weeks.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-2">
              No week progress recorded yet — it appears once they start.
            </p>
          ) : (
            weeks.map((w) => (
              <div
                key={w.number}
                className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 last:border-b-0"
              >
                <span className="min-w-0 truncate text-[15px] text-ink">
                  W{w.number} · {w.title}
                </span>
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
                  {/* Only render a segment that has items — a week with no task
                      must not read as a missed one. */}
                  {[
                    w.modulesTotal > 0 ? `${w.modulesCompleted}/${w.modulesTotal} modules` : null,
                    w.assignmentsTotal > 0
                      ? `${w.assignmentsSubmitted}/${w.assignmentsTotal} assign`
                      : null,
                    w.tasksTotal > 0 ? `${w.tasksSubmitted}/${w.tasksTotal} task` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            ))
          )}
        </Card>
      </section>

      <section>
        <Meta>Submissions</Meta>
        <Card className="mt-3 overflow-hidden">
          {submissions.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-2">Nothing submitted yet.</p>
          ) : (
            submissions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-ink">
                    {s.item_type === "program_task" ? "Programme task" : "Assignment"} · v
                    {s.version}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                    {s.submitted_at ? formatDeadline(new Date(s.submitted_at)) : "draft"}
                  </span>
                </span>
                <StatusChip
                  status={s.status === "draft" ? "not_started" : (s.status as "submitted")}
                  late={s.is_late}
                />
              </div>
            ))
          )}
        </Card>
      </section>

      <ParticipantAdminControls
        enrollmentId={e.id}
        status={e.status}
        statusReason={e.status_reason}
        note={e.admin_notes}
      />

      <section>
        <Meta>Activity</Meta>
        <Card className="mt-3 overflow-hidden">
          {activity.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-2">No activity recorded.</p>
          ) : (
            activity.slice(0, 25).map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-4 border-b border-line px-5 py-2 last:border-b-0"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
                  {a.type}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  {formatRelative(new Date(a.occurred_at))}
                </span>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
