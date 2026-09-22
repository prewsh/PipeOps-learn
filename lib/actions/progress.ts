"use server";

import { revalidatePath } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getSupabase } from "@/lib/supabase/server";

/** Marking a module complete. Always available manually (PRD F5.8). */
export async function completeModule(moduleId: string, slug: string, via: "auto" | "manual") {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("complete_module", {
    p_module_id: moduleId,
    p_via: via,
  });

  if (error) return { error: "We couldn't save that. Try again." };

  await logActivity("MODULE_COMPLETED", moduleId);
  revalidatePath("/", "layout");
  revalidatePath(`/learn/module/${slug}`);
  return {};
}

export async function startModule(moduleId: string) {
  const supabase = await getSupabase();
  await supabase.rpc("start_module", { p_module_id: moduleId });
  await logActivity("MODULE_STARTED", moduleId);
}

/**
 * activity_events has no insert policy — only the service role writes it
 * (AGENTS.md section 7). Failures here must never break the user's action.
 */
export async function logActivity(
  type: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const supabase = await getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const admin = getAdminSupabase();
    const { data: enrollment } = await admin
      .from("enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!enrollment) return;

    await Promise.all([
      admin.from("activity_events").insert({
        enrollment_id: enrollment.id,
        user_id: user.id,
        type,
        target_id: targetId ?? null,
        metadata: metadata ?? {},
      }),
      admin
        .from("enrollments")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", enrollment.id),
    ]);
  } catch {
    // Telemetry must never break the action that produced it.
  }
}
