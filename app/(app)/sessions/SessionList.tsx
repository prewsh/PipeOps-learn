import { Card, EmptyState, Meta } from "@/components/ui";
import { getSessions, type Session } from "@/lib/data/sessions";
import { formatDeadline, formatRelative } from "@/lib/time";

/** Live sessions (PRD F16). */
export async function SessionList() {
  const sessions = await getSessions();
  const upcoming = sessions.filter((s) => !s.past);
  const past = sessions.filter((s) => s.past);

  return (
    <div className="flex flex-col gap-7">
      <header>
        <Meta>Sessions</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[36px]">
          Live with the team
        </h1>
      </header>

      <section>
        <Meta>Upcoming</Meta>
        {upcoming.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No sessions scheduled"
              detail="Live sessions with the PipeOps team will appear here."
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {upcoming.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <Meta>Replays</Meta>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {past.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SessionCard({ session: s }: { session: Session }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      {s.flyerUrl ? (
        // The flyer is the announcement the team already made, so it leads.
        // Decorative: everything it says is repeated as text below, which is
        // also what a participant gets when the signed URL has expired.
        // biome-ignore lint/performance/noImgElement: a signed URL expires, and next/image would cache then serve a dead src
        <img
          src={s.flyerUrl}
          alt=""
          className="aspect-[16/9] w-full border-b border-line object-cover"
        />
      ) : null}
      <div className="flex flex-col px-5 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <Meta>
            {formatDeadline(new Date(s.startsAt))} · {s.durationMinutes} min
          </Meta>
          {s.attended ? (
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
              Attended
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-[18px] font-bold leading-[1.25] tracking-[-0.012em] text-ink">
          {s.topic}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {s.speakerName}
          {s.speakerTitle ? ` · ${s.speakerTitle}` : ""}
        </p>
        {s.description ? (
          <p className="mt-3 text-[15px] leading-[1.55] text-ink-2">{s.description}</p>
        ) : null}

        <div className="mt-4">
          {s.joinable && s.joinUrl ? (
            <a
              href={s.joinUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center justify-center rounded-lg bg-ink px-5 text-[15px] font-medium text-white no-underline hover:bg-ink-surface"
            >
              Join now
            </a>
          ) : s.past && s.replayUrl ? (
            <a
              href={s.replayUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center justify-center rounded-lg border border-line-strong bg-surface px-5 text-[15px] font-medium text-ink no-underline hover:bg-fill-subtle"
            >
              Watch replay
            </a>
          ) : (
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
              {s.past ? "Replay coming soon" : `Starts ${formatRelative(new Date(s.startsAt))}`}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
