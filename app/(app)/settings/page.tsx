import { SettingsForm } from "@/components/SettingsForm";
import { Meta } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("users")
    .select("name, email, socials")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const me = data as unknown as {
    name: string | null;
    email: string;
    socials: Record<string, string> | null;
  } | null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Settings</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[36px]">
          Your profile
        </h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
          {me?.email}
        </p>
      </header>

      <SettingsForm name={me?.name ?? ""} socials={me?.socials ?? {}} />
    </div>
  );
}
