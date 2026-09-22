import { Card, EmptyState, Meta } from "@/components/ui";
import { getAnnouncements } from "@/lib/data/announcements";
import { formatDeadline } from "@/lib/time";

export default async function AnnouncementsPage() {
  const announcements = await getAnnouncements();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Announcements</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          From the team
        </h1>
      </header>

      {announcements.length === 0 ? (
        <EmptyState title="Nothing yet" detail="Updates from the PipeOps team will appear here." />
      ) : (
        announcements.map((a) => (
          <Card key={a.id} className="px-5 py-5">
            <div className="flex items-baseline justify-between gap-3">
              <Meta>
                {a.isPinned ? "Pinned · " : ""}
                {formatDeadline(new Date(a.publishAt))}
              </Meta>
            </div>
            <h2 className="mt-2 text-[20px] font-bold tracking-[-0.012em] text-ink">{a.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-base leading-[1.55] text-ink-2">{a.body}</p>
            {a.linkUrl ? (
              <a
                href={a.linkUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm"
              >
                Open link
              </a>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );
}
