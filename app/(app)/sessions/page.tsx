import { ComingSoon } from "@/components/ComingSoon";

/**
 * Sessions are built (see SessionList.tsx) and the team can already schedule
 * them in /admin/sessions. This stays until the first one is on the calendar.
 */
export default function SessionsPage() {
  return (
    <ComingSoon
      section="Sessions"
      title="Live sessions are on the way"
      detail="Guest sessions with the PipeOps team, plus replays of anything you miss. We'll announce the first one here and in Updates."
    />
  );
}
