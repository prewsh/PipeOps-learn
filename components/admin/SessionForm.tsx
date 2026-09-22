"use client";

import { useActionState, useTransition } from "react";
import { Field, Status, TextArea, TextInput, toCohortLocal } from "@/components/admin/Fields";
import { Button, Card, Meta } from "@/components/ui";
import { type ContentState, deleteSession, saveSession } from "@/lib/actions/content";

export function SessionForm({
  cohortId,
  session,
}: {
  cohortId: string;
  session?: {
    id: string;
    speaker_name: string;
    speaker_title: string | null;
    topic: string;
    description: string | null;
    starts_at: string;
    duration_minutes: number;
    join_url: string | null;
    replay_url: string | null;
  };
}) {
  const [state, action, pending] = useActionState<ContentState, FormData>(
    saveSession.bind(null, cohortId, session?.id ?? null),
    {},
  );

  return (
    <Card className="px-5 py-5">
      <Meta>{session ? "Edit session" : "Schedule a session"}</Meta>
      <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Topic">
          <TextInput name="topic" defaultValue={session?.topic ?? ""} required />
        </Field>
        <Field label="Speaker">
          <TextInput name="speakerName" defaultValue={session?.speaker_name ?? ""} required />
        </Field>
        <Field label="Speaker title">
          <TextInput
            name="speakerTitle"
            defaultValue={session?.speaker_title ?? ""}
            placeholder="Head of Growth, PipeOps"
          />
        </Field>
        <Field label="Starts (WAT)">
          <TextInput
            name="startsAt"
            type="datetime-local"
            defaultValue={toCohortLocal(session?.starts_at ?? null)}
            required
          />
        </Field>
        <Field label="Duration (minutes)">
          <TextInput
            name="durationMinutes"
            type="number"
            min={10}
            max={480}
            defaultValue={session?.duration_minutes ?? 60}
          />
        </Field>
        <Field label="Join link" hint="Shown from 30 minutes before until 30 after.">
          <TextInput
            name="joinUrl"
            defaultValue={session?.join_url ?? ""}
            placeholder="https://…"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Replay link" hint="Add this after the session.">
            <TextInput
              name="replayUrl"
              defaultValue={session?.replay_url ?? ""}
              placeholder="https://…"
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Description">
            <TextArea name="description" rows={3} defaultValue={session?.description ?? ""} />
          </Field>
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : session ? "Save session" : "Schedule session"}
          </Button>
          {session ? <DeleteSession id={session.id} /> : null}
          <Status state={state} />
        </div>
      </form>
    </Card>
  );
}

function DeleteSession({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await deleteSession(id)))}
      className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
