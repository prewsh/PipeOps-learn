"use client";

import { useState, useTransition } from "react";
import { Button, Card, Meta } from "@/components/ui";
import { setSubmissionsOpen } from "@/lib/actions/content";

/** The submission freeze is a cohort flag, enforced server-side (PRD F7). */
export function SubmissionsToggle({ cohortId, open }: { cohortId: string; open: boolean }) {
  const [isOpen, setIsOpen] = useState(open);
  const [pending, start] = useTransition();

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div>
        <Meta>Portal submissions</Meta>
        <p className="mt-1 text-[15px] text-ink">
          {isOpen
            ? "Participants can submit their work."
            : "Frozen — participants see “submissions open soon”."}
        </p>
      </div>
      <Button
        variant={isOpen ? "secondary" : "primary"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await setSubmissionsOpen(cohortId, !isOpen);
            if (!result.error) setIsOpen(!isOpen);
          })
        }
      >
        {pending ? "Saving…" : isOpen ? "Freeze submissions" : "Open submissions"}
      </Button>
    </Card>
  );
}
