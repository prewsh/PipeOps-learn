"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

/**
 * Mobile: 5-slot tab bar. Desktop: the same items as a left rail
 * (docs/DESIGN.md section 6). Same components, same order, same copy — the
 * bar becomes a rail and nothing else changes. No desktop-only features.
 *
 * A nav item is listed only once it exists: one that goes nowhere is worse
 * than one that is missing.
 */
/** The four that earn a permanent slot, on both mobile and desktop. */
const PRIMARY = [
  { href: "/", label: "Home", short: "Home", icon: HomeIcon },
  { href: "/learn", label: "Learn", short: "Learn", icon: LearnIcon },
  { href: "/tasks", label: "Weekly task", short: "Task", icon: TaskIcon },
  { href: "/leaderboard", label: "Leaderboard", short: "Board", icon: BoardIcon },
] as const;

/** Mobile puts these behind More; desktop has room to list them in the rail. */
export const SECONDARY = [
  { href: "/sessions", label: "Sessions", icon: VideoIcon },
  { href: "/resources", label: "Resources", icon: FolderIcon },
  { href: "/announcements", label: "Updates", icon: BellIcon },
  { href: "/settings", label: "Settings", icon: SlidersIcon },
] as const;

export function Nav({
  cohortName,
  weekLabel,
  community,
}: {
  cohortName: string;
  weekLabel: string;
  community?: string | null;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop rail */}
      <nav className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface px-3 py-6 md:flex">
        <div className="flex flex-col gap-1 px-3 pb-7">
          <Logo height={26} />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            Learn
          </span>
        </div>

        <div className="flex flex-col gap-1">
          {[...PRIMARY, ...SECONDARY].map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] no-underline transition-colors ${
                  active
                    ? "bg-ink font-semibold text-white"
                    : "text-ink-2 hover:bg-fill-subtle hover:text-ink"
                }`}
              >
                <Icon />
                {label}
              </Link>
            );
          })}

          {community ? (
            <a
              href={community}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-ink-2 no-underline hover:bg-fill-subtle hover:text-ink"
            >
              <ChatIcon />
              Community{" "}
              <span aria-hidden className="text-ink-3">
                ↗
              </span>
            </a>
          ) : null}
        </div>

        <div className="mt-auto border-t border-line px-3 pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
            {cohortName}
          </p>
          <p className="mt-1 text-sm text-ink-2">{weekLabel}</p>
        </div>
      </nav>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface md:hidden">
        {PRIMARY.map(({ href, short, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 no-underline ${
                active ? "text-ink" : "text-ink-3"
              }`}
            >
              <Icon />
              <span className="font-mono text-[10px] uppercase tracking-[0.06em]">{short}</span>
            </Link>
          );
        })}

        <Link
          href="/more"
          aria-current={pathname.startsWith("/more") ? "page" : undefined}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 no-underline ${
            SECONDARY.some((i) => pathname.startsWith(i.href)) || pathname.startsWith("/more")
              ? "text-ink"
              : "text-ink-3"
          }`}
        >
          <MoreIcon />
          <span className="font-mono text-[10px] uppercase tracking-[0.06em]">More</span>
        </Link>
      </nav>
    </>
  );
}

/* 24px grid, 1.7px stroke, currentColor only (docs/DESIGN.md section 8). */
const svg = {
  viewBox: "0 0 24 24",
  width: 19,
  height: 19,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function HomeIcon() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20H4z" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

function LearnIcon() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M4 5.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4z" />
      <path d="M20 5.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg {...svg} aria-hidden>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.6" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg {...svg} aria-hidden>
      <rect x="3.5" y="6.5" width="12" height="11" rx="2" />
      <path d="M15.5 11l5-2.8v7.6l-5-2.8z" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg {...svg} aria-hidden>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M5 19V11" />
      <path d="M12 19V5" />
      <path d="M19 19v-5.5" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M4 7a1 1 0 0 1 1-1h4l2 2.5h8a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M6.8 10a5.2 5.2 0 0 1 10.4 0c0 4 1.3 5.4 1.3 5.4H5.5S6.8 14 6.8 10z" />
      <path d="M10.3 18.6a2 2 0 0 0 3.4 0" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M5 6.5h14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7l-4 3v-3H5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />
    </svg>
  );
}
