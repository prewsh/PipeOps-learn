"use client";

import { useActionState } from "react";
import { Button, Card, Meta } from "@/components/ui";
import { type AnnouncementState, createAnnouncement } from "@/lib/actions/admin";

export function AnnouncementComposer({ cohortId }: { cohortId: string }) {
  const bound = createAnnouncement.bind(null, cohortId);
  const [state, action, pending] = useActionState<AnnouncementState, FormData>(bound, {});

  return (
    <Card className="px-5 py-5">
      <Meta>New announcement</Meta>
      <form action={action} className="mt-4 flex flex-col gap-3">
        <input
          name="title"
          placeholder="Title"
          required
          className="min-h-11 rounded-lg border border-line-strong bg-surface px-4 text-[15px] text-ink placeholder:text-ink-3"
        />
        <textarea
          name="body"
          rows={5}
          placeholder="What do they need to know?"
          required
          className="rounded-lg border border-line-strong bg-surface p-4 text-[15px] leading-[1.55] text-ink placeholder:text-ink-3"
        />
        <input
          name="linkUrl"
          placeholder="Optional link (https://…)"
          className="min-h-11 rounded-lg border border-line-strong bg-surface px-4 text-[15px] text-ink placeholder:text-ink-3"
        />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="isPinned" className="h-4 w-4" />
          Pin to the top of every dashboard
        </label>

        {state.error ? (
          <p className="flex gap-2 text-sm text-ink" role="alert">
            <span aria-hidden className="font-mono font-medium">
              !
            </span>
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Posted</p>
        ) : null}

        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Posting…" : "Post to cohort"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
