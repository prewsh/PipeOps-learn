"use client";

import { useState } from "react";
import { Button, Card, Meta } from "@/components/ui";
import { type BatchResult, getInviteTargets, sendInviteBatch } from "@/lib/actions/invites";

const BATCH = 10;

type Phase =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "sending"; done: number; total: number }
  | { kind: "finished"; result: BatchResult; total: number }
  | { kind: "error"; message: string };

/**
 * "Invite the cohort" — emails every active participant who has not signed in.
 *
 * It asks before it sends, because it emails real people and cannot be
 * undone. It sends in batches of ten and shows progress, so a slow network
 * or a closed tab leaves an honest count rather than a mystery. Pressing it
 * again later reaches only those who still have not signed in, and anyone
 * emailed in the last ten minutes is skipped server-side.
 */
export function InviteCohort({
  notSignedIn,
  undeployed,
}: {
  notSignedIn: number;
  undeployed: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function run() {
    const { ids, error } = await getInviteTargets();
    if (error) return setPhase({ kind: "error", message: error });
    if (ids.length === 0) {
      return setPhase({
        kind: "finished",
        total: 0,
        result: { sent: 0, skipped: 0, failed: 0, errors: [] },
      });
    }

    const total: BatchResult = { sent: 0, skipped: 0, failed: 0, errors: [] };
    setPhase({ kind: "sending", done: 0, total: ids.length });

    for (let i = 0; i < ids.length; i += BATCH) {
      let r: BatchResult;
      try {
        r = await sendInviteBatch(ids.slice(i, i + BATCH));
      } catch {
        r = {
          sent: 0,
          skipped: 0,
          failed: Math.min(BATCH, ids.length - i),
          errors: ["network error"],
        };
      }
      total.sent += r.sent;
      total.skipped += r.skipped;
      total.failed += r.failed;
      for (const e of r.errors) if (!total.errors.includes(e)) total.errors.push(e);
      setPhase({ kind: "sending", done: Math.min(i + BATCH, ids.length), total: ids.length });
    }

    setPhase({ kind: "finished", result: total, total: ids.length });
  }

  return (
    <Card className="px-5 py-5">
      <Meta>Invite the cohort</Meta>
      <p className="mt-2 text-[15px] leading-[1.55] text-ink">
        Emails an invite to everyone enrolled who hasn't signed in yet.
        {notSignedIn > 0 ? (
          <>
            {" "}
            That's <strong className="font-semibold">{notSignedIn}</strong>{" "}
            {notSignedIn === 1 ? "person" : "people"} right now.
          </>
        ) : null}
      </p>

      {undeployed ? (
        <p className="mt-4 rounded-lg border border-line-strong bg-fill-subtle px-4 py-3 text-sm leading-[1.5] text-ink">
          <span aria-hidden className="mr-1 font-mono font-medium">
            !
          </span>
          This is a local build, so sending is switched off — every link would point at your
          computer. It turns on once the app is deployed.
        </p>
      ) : null}

      <div className="mt-5">
        {phase.kind === "idle" || phase.kind === "error" ? (
          <>
            <Button
              variant="primary"
              disabled={undeployed || notSignedIn === 0}
              onClick={() => setPhase({ kind: "confirm" })}
            >
              {notSignedIn === 0
                ? "Everyone has signed in"
                : `Invite ${notSignedIn} ${notSignedIn === 1 ? "person" : "people"}`}
            </Button>
            {phase.kind === "error" ? (
              <p className="mt-3 text-sm text-ink" role="alert">
                <span aria-hidden className="mr-1 font-mono font-medium">
                  !
                </span>
                {phase.message}
              </p>
            ) : null}
          </>
        ) : null}

        {phase.kind === "confirm" ? (
          <div className="rounded-lg border border-line-strong bg-fill-subtle p-4">
            <p className="text-[15px] leading-[1.55] text-ink">
              Send an invite to {notSignedIn} {notSignedIn === 1 ? "person" : "people"} now? This
              can't be recalled once sent.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => void run()}>
                Yes, send invites
              </Button>
              <Button variant="secondary" onClick={() => setPhase({ kind: "idle" })}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {phase.kind === "sending" ? (
          <div aria-live="polite">
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
              Sending · {phase.done} of {phase.total}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className="motion-state h-full rounded-full bg-ink transition-[width]"
                style={{ width: `${Math.round((phase.done / phase.total) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-ink-2">Keep this tab open until it finishes.</p>
          </div>
        ) : null}

        {phase.kind === "finished" ? (
          <div aria-live="polite" className="flex flex-col gap-2">
            <p className="text-[15px] leading-[1.55] text-ink">
              {phase.total === 0
                ? "Nobody left to invite — everyone has signed in."
                : `Sent ${phase.result.sent}${phase.result.skipped ? `, skipped ${phase.result.skipped} (already emailed in the last 10 minutes, or signed in)` : ""}${phase.result.failed ? `, ${phase.result.failed} failed` : ""}.`}
            </p>
            {phase.result.errors.length > 0 ? (
              <p className="text-sm text-ink-2">Why: {phase.result.errors.join("; ")}.</p>
            ) : null}
            {phase.result.failed > 0 ? (
              <div>
                <Button variant="secondary" onClick={() => setPhase({ kind: "idle" })}>
                  Try the rest again
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
