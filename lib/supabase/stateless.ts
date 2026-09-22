import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Anon-key client with no cookie handling and no persisted session.
 *
 * For server work that must reach Supabase Auth *as nobody* — sending a
 * sign-in email to a third party, for instance. The request-scoped client from
 * `lib/supabase/server` carries the caller's cookies, and an admin performing a
 * support action should not be able to disturb their own session doing it.
 *
 * This is not a privileged client: it holds the same anon key the browser has,
 * so RLS applies in full.
 */
export function getStatelessSupabase() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
