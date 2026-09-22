import { SessionForm } from "@/components/admin/SessionForm";
import { EmptyState, Meta } from "@/components/ui";
import { getSessionsForAdmin } from "@/lib/data/admin";
import { getSupabase } from "@/lib/supabase/server";
import { formatDeadline, formatRelative } from "@/lib/time";

/** Sessions admin (PRD F16). */
export default async function AdminSessionsPage() {
  const supabase = await getSupabase();
  const [{ data: cohort }, sessions] = await Promise.all([
    supabase.from("cohorts").select("id").eq("code", "ugc-01").maybeSingle(),
    getSessionsForAdmin(),
  ]);

  if (!cohort) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Sessions</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[36px]">
          Live sessions
        </h1>
        <p className="mt-2 max-w-[60ch] text-base leading-[1.55] text-ink-2">
          The join link only appears to participants from 30 minutes before the start until 30
          minutes after the end.
        </p>
      </header>

      <SessionForm cohortId={cohort.id} />

      <section>
        <Meta>Scheduled</Meta>
        {sessions.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="Nothing scheduled yet" />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {sessions.map((s) => (
              <div key={s.id} className="flex flex-col gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  {formatDeadline(new Date(s.starts_at))} · {formatRelative(new Date(s.starts_at))}
                </p>
                <SessionForm cohortId={cohort.id} session={s} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
