import { AnnouncementComposer } from "@/components/AnnouncementComposer";
import { Card, EmptyState, Meta } from "@/components/ui";
import { getAllAnnouncements } from "@/lib/data/announcements";
import { getSupabase } from "@/lib/supabase/server";
import { formatDeadline } from "@/lib/time";

export default async function AnnouncementsAdminPage() {
  const supabase = await getSupabase();
  const [{ data: cohort }, announcements] = await Promise.all([
    supabase.from("cohorts").select("id, name").eq("code", "ugc-01").maybeSingle(),
    getAllAnnouncements(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Announcements</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          Tell the cohort something
        </h1>
      </header>

      {cohort ? <AnnouncementComposer cohortId={cohort.id} /> : null}

      <section>
        <Meta>Posted</Meta>
        {announcements.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="Nothing posted yet" />
          </div>
        ) : (
          <Card className="mt-3 overflow-hidden">
            {announcements.map((a) => (
              <div key={a.id} className="border-b border-line px-5 py-4 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[15px] font-medium text-ink">{a.title}</p>
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                    {a.is_pinned ? "pinned · " : ""}
                    {formatDeadline(new Date(a.publish_at))}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-ink-2">{a.body}</p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  {a.audience?.type === "ids"
                    ? `${a.audience.ids?.length ?? 0} participants`
                    : "whole cohort"}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
