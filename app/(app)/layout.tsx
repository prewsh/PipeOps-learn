import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signOut } from "@/lib/auth/actions";
import { getMe, getWeeks } from "@/lib/data/program";
import { getSupabase } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login?error=not-enrolled");

  const supabase = await getSupabase();
  const [weeks, { data: cohort }] = await Promise.all([
    getWeeks(),
    supabase.from("cohorts").select("ends_on, discord_url").eq("id", me.cohortId).maybeSingle(),
  ]);

  const current = weeks.find((w) => w.state === "current");
  const endsOn = cohort?.ends_on
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
        new Date(cohort.ends_on),
      )
    : null;

  const weekLabel = current
    ? `Week ${current.number} of ${weeks.length}${endsOn ? ` · ends ${endsOn}` : ""}`
    : `${weeks.length} weeks`;

  return (
    <div className="min-h-dvh bg-canvas">
      <Nav cohortName={me.cohortName} weekLabel={weekLabel} community={cohort?.discord_url} />

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3 backdrop-blur md:hidden">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
            {me.cohortName}
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={signOut}>
              <button
                type="submit"
                className="min-h-11 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {/* Desktop keeps the chrome minimal: the rail carries identity, so the
            top bar only holds the account action. */}
        <header className="sticky top-0 z-30 hidden items-center justify-end gap-4 border-b border-line bg-surface/95 px-8 py-1.5 backdrop-blur md:flex">
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </header>

        <main className="motion-enter mx-auto w-full max-w-[84rem] px-5 pb-28 pt-6 md:px-8 md:pb-16 md:pt-8 xl:px-12">
          {children}
        </main>
      </div>
    </div>
  );
}
