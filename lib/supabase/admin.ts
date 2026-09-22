import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client. BYPASSES RLS.
 *
 * Only for work the user cannot do as themselves: checking an email against
 * the enrolment list before sign-in (F1.2), participant import, and writing
 * activity_events (which has no insert policy by design).
 *
 * Never import this into a client component.
 */
export function getAdminSupabase() {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for this operation");

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
