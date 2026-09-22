import Link from "next/link";
import { Card, Meta } from "@/components/ui";
import { signOut } from "@/lib/auth/actions";

/**
 * The mobile "More" sheet. Desktop lists these in the rail directly, so this
 * page exists for the narrow layout where the tab bar has only five slots
 * (docs/DESIGN.md section 6).
 */
const ITEMS = [
  { href: "/sessions", label: "Sessions", detail: "Live calls and replays" },
  { href: "/resources", label: "Resources", detail: "Templates and extras" },
  { href: "/announcements", label: "Updates", detail: "News from the team" },
  { href: "/settings", label: "Settings", detail: "Name, handles, leaderboard" },
] as const;

export default function MorePage() {
  return (
    <div className="flex flex-col gap-6 md:hidden">
      <header>
        <Meta>More</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          Everything else
        </h1>
      </header>

      <Card className="overflow-hidden">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-5 py-3 no-underline last:border-b-0 hover:bg-fill-subtle"
          >
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-ink">{item.label}</span>
              <span className="mt-0.5 block truncate text-sm text-ink-2">{item.detail}</span>
            </span>
            <span aria-hidden className="shrink-0 text-ink-3">
              →
            </span>
          </Link>
        ))}
      </Card>

      <form action={signOut}>
        <button
          type="submit"
          className="flex min-h-11 w-full items-center justify-center rounded-lg border border-line-strong bg-surface px-5 text-[15px] text-ink"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
