"use client";

import type { ComponentProps, ReactNode } from "react";

/** Shared form primitives for the admin editors — one place for the styling,
 *  so every editor matches without repeating class strings. */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children and wrapped by this label, which is valid implicit association — the rule cannot see through the children prop
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">{label}</span>
      {children}
      {hint ? <span className="text-sm text-ink-2">{hint}</span> : null}
    </label>
  );
}

const base =
  "w-full rounded-lg border border-line-strong bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-3";

export function TextInput(props: ComponentProps<"input">) {
  return <input {...props} className={`min-h-11 ${base} ${props.className ?? ""}`} />;
}

export function TextArea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`py-3 leading-[1.55] ${base} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`min-h-11 ${base} ${props.className ?? ""}`} />;
}

/** datetime-local expects `YYYY-MM-DDTHH:mm` in COHORT time, not the viewer's. */
export function toCohortLocal(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function Status({ state }: { state: { error?: string; ok?: string } }) {
  if (state.error) {
    return (
      <p className="flex gap-2 text-sm text-ink" role="alert">
        <span aria-hidden className="font-mono font-medium">
          !
        </span>
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">{state.ok}</p>
    );
  }
  return null;
}
