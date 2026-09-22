/**
 * Status without colour (docs/DESIGN.md section 3).
 *
 * Every state is a 6px marker plus a word. The marker carries the meaning
 * through shape, so the same chip works in the app, the admin table and a
 * plain-text email. Never add a hue to express state.
 */
export type Status =
  | "complete"
  | "approved"
  | "submitted"
  | "under_review"
  | "needs_revision"
  | "not_started"
  | "in_progress"
  | "locked"
  | "late";

const LABEL: Record<Status, string> = {
  complete: "Complete",
  approved: "Approved",
  submitted: "Submitted",
  under_review: "Under review",
  needs_revision: "Needs revision",
  not_started: "Not started",
  in_progress: "In progress",
  locked: "Locked",
  late: "Late",
};

function Marker({ status }: { status: Status }) {
  const base = "inline-block h-1.5 w-1.5 shrink-0 rounded-full";

  switch (status) {
    case "complete":
    case "approved":
      return <span className={`${base} bg-ink`} aria-hidden />;
    case "submitted":
    case "under_review":
    case "in_progress":
      return <span className={`${base} border border-ink bg-transparent`} aria-hidden />;
    case "needs_revision":
      // half-filled — attention
      return (
        <span
          className={`${base} border border-ink bg-gradient-to-r from-ink from-50% to-transparent to-50%`}
          aria-hidden
        />
      );
    case "locked":
      return (
        <span className="inline-flex h-1.5 w-2.5 shrink-0 items-center gap-px" aria-hidden>
          <span className="h-1.5 w-1.5 rounded-full border border-ink-3" />
          <span className="h-1.5 w-px bg-ink-3" />
        </span>
      );
    default:
      return <span className={`${base} border border-line-strong bg-transparent`} aria-hidden />;
  }
}

export function StatusChip({ status, late }: { status: Status; late?: boolean }) {
  const muted = status === "locked" || status === "not_started";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] ${
        muted ? "text-ink-3" : "text-ink-2"
      }`}
    >
      <Marker status={status} />
      {LABEL[status]}
      {late ? <span className="text-ink-2">/ late</span> : null}
    </span>
  );
}
