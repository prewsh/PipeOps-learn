"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { reviewSubmission } from "@/lib/actions/submissions";

/**
 * Review controls (PRD F13.3).
 *
 * Keyboard-first: reviewing ~100 submissions a week by mouse is untenable.
 * A = approve, R = request revision. Shortcuts are suppressed while typing.
 */
export function ReviewActions({
  submissionId,
  focused,
}: {
  submissionId: string;
  focused: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  async function act(status: "approved" | "needs_revision", note: string | null) {
    setBusy(true);
    const result = await reviewSubmission(submissionId, status, note);
    setBusy(false);
    if (!result.error) setDone(status);
  }

  useEffect(() => {
    if (!focused || done) return;

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        void act("approved", null);
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        setAsking(true);
        setTimeout(() => noteRef.current?.focus(), 0);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (done) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
        {done === "approved" ? "Approved" : "Revision requested"}
      </p>
    );
  }

  if (asking) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          ref={noteRef}
          rows={3}
          placeholder="What needs to change? This is sent to the participant."
          className="w-full rounded-lg border border-line-strong bg-surface p-3 text-sm text-ink outline-none"
        />
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              const note = noteRef.current?.value.trim();
              if (!note) {
                noteRef.current?.focus();
                return;
              }
              void act("needs_revision", note);
            }}
          >
            Send request
          </Button>
          <Button variant="ghost" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" disabled={busy} onClick={() => void act("approved", null)}>
        Approve
        <kbd className="ml-1 font-mono text-[10px] opacity-60">A</kbd>
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => setAsking(true)}>
        Request revision
        <kbd className="ml-1 font-mono text-[10px] opacity-60">R</kbd>
      </Button>
    </div>
  );
}
