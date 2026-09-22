"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1, "Tell us what to call you.").max(80),
  socials: z.record(z.string(), z.string().trim().max(120)),
});

export type SettingsState = { error?: string; ok?: boolean };

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    socials: {
      linkedin: String(formData.get("linkedin") ?? ""),
      x: String(formData.get("x") ?? ""),
      tiktok: String(formData.get("tiktok") ?? ""),
      instagram: String(formData.get("instagram") ?? ""),
      youtube: String(formData.get("youtube") ?? ""),
    },
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Sign in again." };

  const socials = Object.fromEntries(
    Object.entries(parsed.data.socials).filter(([, v]) => v.length > 0),
  );

  // RLS restricts this update to the caller's own row, so the id comes from
  // the session and never from the form.
  const { error } = await supabase
    .from("users")
    .update({
      name: parsed.data.name,
      socials,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: "We couldn't save that. Try again." };

  revalidatePath("/", "layout");
  return { ok: true };
}
