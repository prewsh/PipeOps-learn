"use client";

import { useState, useTransition } from "react";
import { Button, Card, Meta } from "@/components/ui";
import { type CohortFlag, setCohortFlag } from "@/lib/actions/content";

type FlagSpec = {
  flag: CohortFlag;
  label: string;
  on: string;
  off: string;
  enable: string;
  disable: string;
};

/**
 * The three cohort-level switches (PRD F7, F10, F16).
 *
 * Each is data, not a code path: the leaderboard and sessions pages read these
 * flags, so switching one on takes effect on the next page load with no
 * deploy. Every change writes an audit row.
 */
const FLAGS: FlagSpec[] = [
  {
    flag: "submissions_open",
    label: "Portal submissions",
    on: "Participants can submit their work.",
    off: "Frozen — participants see “submissions open soon”.",
    enable: "Open submissions",
    disable: "Freeze submissions",
  },
  {
    flag: "leaderboard_visible",
    label: "Leaderboard",
    on: "Rankings are visible to participants.",
    off: "Hidden — points still accrue, participants see “coming soon”.",
    enable: "Show leaderboard",
    disable: "Hide leaderboard",
  },
  {
    flag: "sessions_visible",
    label: "Live sessions",
    on: "Scheduled sessions and replays are visible.",
    off: "Hidden — you can still schedule, participants see “coming soon”.",
    enable: "Show sessions",
    disable: "Hide sessions",
  },
];

export function CohortFlags({
  cohortId,
  values,
}: {
  cohortId: string;
  values: Record<CohortFlag, boolean>;
}) {
  const [state, setState] = useState(values);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {FLAGS.map((spec) => {
        const isOn = state[spec.flag];
        return (
          <Card
            key={spec.flag}
            className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
          >
            <div>
              <Meta>{spec.label}</Meta>
              <p className="mt-1 text-[15px] text-ink">{isOn ? spec.on : spec.off}</p>
            </div>
            <Button
              variant={isOn ? "secondary" : "primary"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await setCohortFlag(cohortId, spec.flag, !isOn);
                  if (result.error) setError(result.error);
                  else {
                    setError(null);
                    setState((prev) => ({ ...prev, [spec.flag]: !isOn }));
                  }
                })
              }
            >
              {pending ? "Saving…" : isOn ? spec.disable : spec.enable}
            </Button>
          </Card>
        );
      })}

      {error ? (
        <p className="flex gap-2 text-sm text-ink" role="alert">
          <span aria-hidden className="font-mono font-medium">
            !
          </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
