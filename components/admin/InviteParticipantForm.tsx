"use client";

import { useActionState } from "react";
import { Field, TextInput } from "@/components/admin/Fields";
import { Button, Card, Meta } from "@/components/ui";
import { type InviteState, inviteParticipant } from "@/lib/actions/invites";

/**
 * Add one participant: enrol them, create their login account, and (by
 * default) email their invite. For late joiners and corrections — the
 * accepted list itself still comes in through the import.
 */
export function InviteParticipantForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteParticipant, {});

  return (
    <Card className="px-5 py-5">
      <Meta>Add a participant</Meta>
      <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Full name">
          <TextInput name="name" required autoComplete="off" />
        </Field>
        <Field label="Email" hint="The address they applied with.">
          <TextInput name="email" type="email" required autoComplete="off" />
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink md:col-span-2">
          <input type="checkbox" name="sendNow" defaultChecked className="h-4 w-4" />
          Email their invite now
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Adding…" : "Add participant"}
          </Button>
          {state.ok ? (
            <p className="text-sm text-ink" role="status">
              {state.ok}
            </p>
          ) : null}
          {state.error ? (
            <p className="text-sm text-ink" role="alert">
              <span aria-hidden className="mr-1 font-mono font-medium">
                !
              </span>
              {state.error}
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
