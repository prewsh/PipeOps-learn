"use client";

import { useState } from "react";
import { Button, Card, Meta } from "@/components/ui";
import { setAdminNote, setEnrollmentStatus } from "@/lib/actions/admin";

/** Status changes require a reason, and every change is audited (F12.6). */
export function ParticipantAdminControls({
  enrollmentId,
  status,
  statusReason,
  note,
}: {
  enrollmentId: string;
  status: string;
  statusReason: string | null;
  note: string | null;
}) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [reason, setReason] = useState("");
  const [nextStatus, setNextStatus] = useState<string>("");
  const [noteText, setNoteText] = useState(note ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card className="px-5 py-5">
      <Meta>Admin controls</Meta>

      <div className="mt-4 flex flex-col gap-3">
        <label
          htmlFor="status"
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3"
        >
          Enrolment status — currently {currentStatus}
          {statusReason ? ` (${statusReason})` : ""}
        </label>
        <div className="flex flex-wrap gap-2">
          <select
            id="status"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value)}
            className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-ink"
          >
            <option value="">Change to…</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="revoked">Revoked</option>
          </select>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="min-h-11 flex-1 rounded-lg border border-line-strong bg-surface px-4 text-[15px] text-ink placeholder:text-ink-3"
          />
          <Button
            disabled={busy || !nextStatus || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              const result = await setEnrollmentStatus(
                enrollmentId,
                nextStatus as "active",
                reason,
              );
              setBusy(false);
              if (result.error) {
                setMessage(result.error);
              } else {
                setCurrentStatus(nextStatus);
                setNextStatus("");
                setReason("");
                setMessage("Status updated.");
              }
            }}
          >
            Apply
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <label
          htmlFor="note"
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3"
        >
          Admin note — not visible to the participant
        </label>
        <textarea
          id="note"
          rows={3}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="rounded-lg border border-line-strong bg-surface p-3 text-[15px] text-ink"
        />
        <div className="flex items-center gap-3">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await setAdminNote(enrollmentId, noteText);
              setBusy(false);
              setMessage(result.error ?? "Note saved.");
            }}
          >
            Save note
          </Button>
          {message ? (
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
              {message}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
