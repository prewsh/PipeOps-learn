"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordLogin } from "@/lib/auth/actions";
import { getSupabase } from "@/lib/supabase/server";

/**
 * Staff sign-in — email and password, separate from the participant door.
 *
 * Participants stay passwordless: there are 114 of them, they are on phones,
 * and a password they must remember for six weeks is a support burden
 * (ADR 0002). Staff are few, need reliable repeat access from any device, and
 * cannot be blocked by email deliverability. Different users, different
 * mechanism.
 *
 * A participant who finds this page and enters valid credentials is signed
 * straight back out: the role check happens server-side after authentication,
 * so this is not a second way into the participant app.
 */
const schema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export type AdminAuthState = { error?: string };

export async function adminSignIn(
  _prev: AdminAuthState,
  formData: FormData,
): Promise<AdminAuthState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  // Deliberately generic: do not reveal whether the address exists.
  if (error) return { error: "That email and password don't match." };

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    await supabase.auth.signOut();
    return { error: "That account doesn't have admin access." };
  }

  await recordLogin();
  redirect("/admin");
}
