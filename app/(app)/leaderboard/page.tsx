import { ComingSoon } from "@/components/ComingSoon";

/**
 * The board is built (see Board.tsx) but not switched on. Points already
 * accrue in the ledger, so nothing is lost by waiting — turning it on means
 * rendering <Board /> here instead.
 */
export default function LeaderboardPage() {
  return (
    <ComingSoon
      section="Leaderboard"
      title="The board is warming up"
      detail="Your points are already being counted — every module you finish and every task you submit. We'll open the rankings once everyone has had a fair run at week one."
    />
  );
}
