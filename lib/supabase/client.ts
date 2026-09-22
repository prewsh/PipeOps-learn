"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client. Used by the video player to persist progress. */
export function getBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}
