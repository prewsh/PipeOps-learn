import { Card, EmptyState, Meta } from "@/components/ui";
import {
  getConsistentBoard,
  getLeaderboard,
  getMyStanding,
  ruleLabel,
} from "@/lib/data/leaderboard";

/**
 * Creator leaderboard (PRD F10).
 *
 * Ranks behaviour, never reach — there are no follower counts, likes or views
 * anywhere on this page, by design.
 */
export async function Board() {
  const [board, consistent, standing] = await Promise.all([
    getLeaderboard(),
    getConsistentBoard(),
    getMyStanding(),
  ]);

  return (
    <div className="flex flex-col gap-7">
      <header>
        <Meta>Leaderboard</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[36px]">
          Creator board
        </h1>
        <p className="mt-2 max-w-[54ch] text-base leading-[1.55] text-ink-2">
          Points come from what you do — watching, submitting, finishing weeks on time. Never from
          followers, likes or views.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="px-5 py-5">
          <Meta>Your position</Meta>
          <p className="mt-2 font-mono text-[32px] leading-none text-ink">
            {standing.rank ? `#${standing.rank}` : "—"}
          </p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
            of {standing.activeCreators} active creators
          </p>
        </Card>
        <Card className="px-5 py-5">
          <Meta>Points</Meta>
          <p className="mt-2 font-mono text-[32px] leading-none text-ink">{standing.points}</p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
            earned so far
          </p>
        </Card>
        <Card className="px-5 py-5">
          <Meta>Streak</Meta>
          <p className="mt-2 font-mono text-[32px] leading-none text-ink">
            {standing.streak}
            <span className="ml-1 text-[15px] text-ink-3">wk</span>
          </p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
            weeks finished in a row
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <Meta>Top creators</Meta>
          {board.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="Nobody has scored yet"
                detail="Points appear as people complete modules and submit work."
              />
            </div>
          ) : (
            <Card className="mt-3 overflow-hidden">
              {board.map((row) => (
                <div
                  key={`${row.rank}-${row.displayName}`}
                  className={`flex min-h-12 items-center gap-4 border-b border-line px-5 py-2.5 last:border-b-0 ${
                    row.isMe ? "bg-fill-subtle" : ""
                  }`}
                >
                  <span className="w-8 shrink-0 font-mono text-[13px] text-ink-3">{row.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
                    {row.displayName}
                    {row.isMe ? (
                      <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                        you
                      </span>
                    ) : null}
                  </span>
                  {row.streak > 0 ? (
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                      {row.streak}wk
                    </span>
                  ) : null}
                  <span className="w-14 shrink-0 text-right font-mono text-[15px] text-ink">
                    {row.points}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section>
            <Meta>Most consistent</Meta>
            <Card className="mt-3 overflow-hidden">
              {consistent.length === 0 ? (
                <p className="px-5 py-5 text-sm text-ink-2">No weeks completed yet.</p>
              ) : (
                consistent.map((row) => (
                  <div
                    key={`${row.rank}-${row.displayName}`}
                    className={`flex min-h-12 items-center gap-3 border-b border-line px-5 py-2.5 last:border-b-0 ${
                      row.isMe ? "bg-fill-subtle" : ""
                    }`}
                  >
                    <span className="w-6 shrink-0 font-mono text-[13px] text-ink-3">
                      {row.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
                      {row.displayName}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                      {row.weeksCompleted}wk · {row.onTimeRate}%
                    </span>
                  </div>
                ))
              )}
            </Card>
          </section>

          <section>
            <Meta>How you earned it</Meta>
            <Card className="mt-3 overflow-hidden">
              {standing.breakdown.length === 0 ? (
                <p className="px-5 py-5 text-sm text-ink-2">
                  Complete a module to get on the board.
                </p>
              ) : (
                standing.breakdown.map((row) => (
                  <div
                    key={row.rule}
                    className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-5 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-sm text-ink-2">
                      {ruleLabel(row.rule)}
                      <span className="ml-2 font-mono text-[11px] text-ink-3">×{row.count}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[13px] text-ink">{row.points}</span>
                  </div>
                ))
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
