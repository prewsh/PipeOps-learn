import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signOut } from "@/lib/auth/actions";
import { isAdmin } from "@/lib/data/admin";

/** Role-gated. The check is a database function, not a client claim. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");

  return (
    <div className="min-h-dvh bg-canvas">
      <AdminNav />

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur md:gap-4 md:px-8 md:py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 md:hidden">
            Admin
          </span>
          <div className="ml-auto flex items-center gap-3 md:gap-5">
            <ThemeToggle />
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 no-underline hover:text-ink"
            >
              Participant view
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="motion-enter mx-auto w-full max-w-[84rem] px-5 pb-24 pt-6 md:px-8 md:pb-16 md:pt-8 xl:px-12">
          {children}
        </main>
      </div>
    </div>
  );
}
