import { SettingsForm } from "@/components/SettingsForm";
import { Card, Meta } from "@/components/ui";
import { getMe } from "@/lib/data/program";
import { unwrap } from "@/lib/data/query";
import { getSupabase } from "@/lib/supabase/server";

/** Two letters from a name, or one from an address — never an empty disc. */
function initials(label: string): string {
  const words = label
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1))
    .map((w) => w?.[0] ?? "")
    .join("");
  return (letters || "?").toUpperCase();
}

export default async function SettingsPage() {
  const me = await getMe();
  if (!me) return null;

  const supabase = await getSupabase();
  const profile = unwrap(
    await supabase.from("users").select("socials").eq("id", me.userId).maybeSingle(),
    "your profile",
  ) as { socials: Record<string, string> | null } | null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Settings</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[36px]">
          Your account
        </h1>
      </header>

      {/* Who is signed in, before anything else on the page. The name is the
          same one the dashboard greets them with: the enrolment's name until
          they set their own, never the placeholder derived from the address. */}
      <Card className="flex items-start gap-4 px-5 py-5">
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[15px] font-medium text-on-ink"
        >
          {initials(me.name)}
        </span>
        <div className="min-w-0">
          <Meta>Signed in as</Meta>
          <p className="mt-1 text-[19px] font-semibold leading-[1.25] tracking-[-0.012em] text-ink [overflow-wrap:anywhere]">
            {me.name}
          </p>
          <p className="mt-0.5 text-[15px] text-ink-2 [overflow-wrap:anywhere]">{me.email}</p>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
            {me.cohortName}
          </p>
          <p className="mt-3 border-t border-line pt-3 text-sm leading-[1.5] text-ink-2">
            This is the email you sign in with. To change it, contact the programme team.
          </p>
        </div>
      </Card>

      <SettingsForm name={me.name} socials={profile?.socials ?? {}} />
    </div>
  );
}
