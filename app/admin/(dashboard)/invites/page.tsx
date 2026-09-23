import { InviteCohort } from "@/components/admin/InviteCohort";
import { InviteParticipantForm } from "@/components/admin/InviteParticipantForm";
import { Card, EmptyState, Meta } from "@/components/ui";
import { getInviteOverview } from "@/lib/data/invites";
import { formatDeadline, formatRelative } from "@/lib/time";

const ACTION_LABEL = {
  "enrollment.invite": "Added",
  "auth.invite": "Invited",
  "auth.resend": "Resent",
} as const;

/** Invites (PRD F1.10, F12.6): add people, and send the cohort its way in. */
export default async function InvitesPage() {
  const overview = await getInviteOverview();

  if (!overview) {
    return <EmptyState title="No active cohort" detail="Invites go to the active cohort." />;
  }

  const stats = [
    { label: "Enrolled", value: overview.enrolled },
    { label: "Signed in", value: overview.signedIn },
    { label: "Not signed in yet", value: overview.notSignedIn },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Invites · {overview.cohortName}</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[36px]">
          Invite participants
        </h1>
        <p className="mt-2 max-w-[60ch] text-base leading-[1.55] text-ink-2">
          Participants get the Supabase sign-in email: a link and a code, either of which gets them
          in. Nobody can sign in without being on this list.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="min-w-0 px-4 py-4">
            <p className="font-mono text-[22px] font-medium leading-none text-ink">{s.value}</p>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
              {s.label}
            </p>
          </Card>
        ))}
      </div>

      {overview.lastSentAt ? (
        <p className="-mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
          Last invite sent {formatDeadline(new Date(overview.lastSentAt))} ·{" "}
          {formatRelative(new Date(overview.lastSentAt))}
        </p>
      ) : null}

      <InviteCohort notSignedIn={overview.notSignedIn} undeployed={overview.undeployed} />

      <InviteParticipantForm />

      <section>
        <Meta>Recent</Meta>
        {overview.recent.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No invites sent yet" />
          </div>
        ) : (
          <Card className="mt-3 overflow-hidden">
            {overview.recent.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3 last:border-b-0"
              >
                <span className="min-w-0 text-[15px] text-ink">
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                    {ACTION_LABEL[r.action]}
                  </span>{" "}
                  {r.participant}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  {formatRelative(new Date(r.at))} · by {r.by}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
