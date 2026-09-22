import { ComingSoon } from "@/components/ComingSoon";
import { getMe } from "@/lib/data/program";
import { Board } from "./Board";

/**
 * The board is built and points already accrue in the ledger. Whether
 * participants can see it is cohort data, not a code path — an admin flips
 * `leaderboard_visible` in /admin/settings and it appears, with an audit row.
 */
export default async function LeaderboardPage() {
  const me = await getMe();

  if (!me?.leaderboardVisible) {
    return (
      <ComingSoon
        section="Leaderboard"
        title="The board is warming up"
        detail="Your points are already being counted — every module you finish and every task you submit. We'll open the rankings once everyone has had a fair run at week one."
      />
    );
  }

  return <Board />;
}
