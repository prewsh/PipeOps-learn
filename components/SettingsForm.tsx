"use client";

import { useActionState } from "react";
import { Button, Card, Meta } from "@/components/ui";
import { type SettingsState, saveSettings } from "@/lib/actions/settings";

const PLATFORMS = [
  { name: "linkedin", label: "LinkedIn" },
  { name: "x", label: "X" },
  { name: "tiktok", label: "TikTok" },
  { name: "instagram", label: "Instagram" },
  { name: "youtube", label: "YouTube" },
] as const;

export function SettingsForm({ name, socials }: { name: string; socials: Record<string, string> }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});

  return (
    <form action={action} className="flex flex-col gap-5">
      <Card className="px-5 py-5">
        <Meta>Display name</Meta>
        <p className="mt-1 text-sm text-ink-2">This is what appears on the leaderboard.</p>
        <input
          name="name"
          defaultValue={name}
          required
          maxLength={80}
          className="mt-3 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-4 text-base text-ink outline-none"
        />
      </Card>

      <Card className="px-5 py-5">
        <Meta>Where you publish</Meta>
        <p className="mt-1 text-sm text-ink-2">
          Handles only — we never read metrics from these, they just help the team find your work.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {PLATFORMS.map((p) => (
            <label key={p.name} className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                {p.label}
              </span>
              <input
                name={p.name}
                defaultValue={socials[p.name] ?? ""}
                placeholder="@handle"
                className="min-h-11 rounded-lg border border-line-strong bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-3"
              />
            </label>
          ))}
        </div>
      </Card>

      {state.error ? (
        <p className="flex gap-2 text-sm text-ink" role="alert">
          <span aria-hidden className="font-mono font-medium">
            !
          </span>
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {state.ok ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
