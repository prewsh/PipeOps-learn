import { ComingSoon } from "@/components/ComingSoon";
import { getMe } from "@/lib/data/program";
import { SessionList } from "./SessionList";

/**
 * Sessions can be scheduled in /admin/sessions today. Whether participants see
 * them is cohort data, not a code path — an admin flips `sessions_visible` in
 * /admin/settings once the first one is on the calendar.
 */
export default async function SessionsPage() {
  const me = await getMe();

  if (!me?.sessionsVisible) {
    return (
      <ComingSoon
        section="Sessions"
        title="Live sessions are on the way"
        detail="Guest sessions with the PipeOps team, plus replays of anything you miss. We'll announce the first one here and in Updates."
      />
    );
  }

  return <SessionList />;
}
