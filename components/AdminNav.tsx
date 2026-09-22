"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

/**
 * Admin rail. Same structure as the participant rail, on ink-surface — the
 * design system reserves the dark surface for the admin console so the two
 * apps are never confused at a glance (docs/DESIGN.md section 1).
 */
const ITEMS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/participants", label: "Participants" },
  { href: "/admin/submissions", label: "Review queue" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/announcements", label: "Announcements" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <>
      <nav className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-ink-surface px-3 py-6 md:flex">
        <div className="flex flex-col gap-1 px-3 pb-7">
          <Logo variant="white" height={26} />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/40">
            Learn · admin
          </span>
        </div>

        <div className="flex flex-col gap-1">
          {ITEMS.map((item) => {
            const active = isActive(item.href, "exact" in item ? item.exact : false);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-xl px-3 text-[15px] no-underline transition-colors ${
                  active
                    ? "bg-white font-semibold text-ink"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto border-t border-white/15 px-3 pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-white/40">
            Cohort 01
          </p>
        </div>
      </nav>

      {/* Mobile: the rail collapses to a scrollable strip rather than a tab bar —
          admin work is desktop-shaped and this stays out of the way. */}
      <nav className="flex gap-1 overflow-x-auto bg-ink-surface px-3 py-2 md:hidden">
        {ITEMS.map((item) => {
          const active = isActive(item.href, "exact" in item ? item.exact : false);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-10 shrink-0 items-center rounded-lg px-3 font-mono text-[11px] uppercase tracking-[0.06em] no-underline ${
                active ? "bg-white text-ink" : "text-white/70"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
