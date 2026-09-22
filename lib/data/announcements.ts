import { cache } from "react";
import { getSupabase } from "@/lib/supabase/server";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  isPinned: boolean;
  publishAt: string;
  read: boolean;
};

/** Published announcements addressed to the caller. RLS does the targeting. */
export const getAnnouncements = cache(async (): Promise<Announcement[]> => {
  const supabase = await getSupabase();

  const [{ data: rows }, { data: reads }] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, title, body, link_url, is_pinned, publish_at")
      .lte("publish_at", new Date().toISOString())
      .order("is_pinned", { ascending: false })
      .order("publish_at", { ascending: false }),
    supabase.from("announcement_reads").select("announcement_id"),
  ]);

  const readIds = new Set((reads ?? []).map((r) => r.announcement_id));

  return (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    linkUrl: r.link_url,
    isPinned: r.is_pinned,
    publishAt: r.publish_at,
    read: readIds.has(r.id),
  }));
});

/** Admin view: everything, including scheduled and unpublished. */
export async function getAllAnnouncements() {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, is_pinned, publish_at, audience, send_email")
    .order("publish_at", { ascending: false });

  return (data ?? []) as unknown as {
    id: string;
    title: string;
    body: string;
    is_pinned: boolean;
    publish_at: string;
    audience: { type: string; ids?: string[] };
    send_email: boolean;
  }[];
}
