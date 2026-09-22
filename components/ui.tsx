import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Primitives from docs/DESIGN.md sections 2 and 4.
 * One dominant action per screen: exactly one `primary` button per view.
 */

type ButtonVariant = "primary" | "secondary" | "ghost";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink-surface",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-fill-subtle",
  ghost: "text-ink-2 hover:text-ink",
};

// 44px tap-target floor — a hard rule, not a suggestion.
const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={`${BUTTON_BASE} ${BUTTON[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link className={`${BUTTON_BASE} ${BUTTON[variant]} no-underline ${className}`} {...props} />
  );
}

/** Mono meta label — 11px, caps, +6% tracking. Carries numbers, never prose. */
export function Meta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 ${className}`}>
      {children}
    </p>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

/** Every list has a designed empty state. "No data" is a bug. */
export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <Card className="px-6 py-10 text-center">
      <p className="text-[17px] font-semibold tracking-[-0.012em] text-ink">{title}</p>
      {detail ? <p className="mt-2 text-sm text-ink-2">{detail}</p> : null}
    </Card>
  );
}

/** Programme progress: "45% · 14/30" plus a segmented week rail. */
export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-line-strong">
      <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}
