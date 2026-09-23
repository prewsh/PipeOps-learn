"use client";

import { useActionState, useState } from "react";
import { type AnnouncementState, deleteAnnouncement } from "@/lib/actions/admin";

export function AnnouncementDeleteControl({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<AnnouncementState, FormData>(
    deleteAnnouncement.bind(null, id),
    {},
  );

  return (
    <div className="mt-3">
      {confirming ? (
        <form action={action} className="rounded-lg border border-line-strong bg-fill-subtle p-3">
          <p className="text-sm text-ink">
            Delete this update for participants? This cannot recall an email already sent.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-lg bg-ink px-4 text-sm font-medium text-surface disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Delete update"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="min-h-11 rounded-lg border border-line-strong bg-surface px-4 text-sm text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-11 rounded-lg border border-line-strong px-4 text-sm text-ink hover:bg-fill-subtle"
        >
          Delete
        </button>
      )}
      {state.error ? (
        <p className="mt-2 text-sm text-ink" role="alert">
          ! {state.error}
        </p>
      ) : null}
    </div>
  );
}
