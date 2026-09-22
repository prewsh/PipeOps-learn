import { cache } from "react";
import { unwrap } from "@/lib/data/query";
import { getSupabase } from "@/lib/supabase/server";

export type Session = {
  id: string;
  speakerName: string;
  speakerTitle: string | null;
  topic: string;
  description: string | null;
  startsAt: string;
  durationMinutes: number;
  joinUrl: string | null;
  replayUrl: string | null;
  /** True from 30 minutes before the start until 30 minutes after the end. */
  joinable: boolean;
  past: boolean;
  attended: boolean;
};

export const getSessions = cache(async (): Promise<Session[]> => {
  const supabase = await getSupabase();

  const [rowsRes, attendanceRes] = await Promise.all([
    supabase
      .from("live_sessions")
      .select(
        "id, speaker_name, speaker_title, topic, description, starts_at, " +
          "duration_minutes, join_url, replay_url",
      )
      .order("starts_at", { ascending: true }),
    supabase.from("session_attendance").select("session_id, attended"),
  ]);
  const rows = unwrap(rowsRes, "live sessions");
  const attendance = unwrap(attendanceRes, "session attendance");

  type SessionRow = {
    id: string;
    speaker_name: string;
    speaker_title: string | null;
    topic: string;
    description: string | null;
    starts_at: string;
    duration_minutes: number | null;
    join_url: string | null;
    replay_url: string | null;
  };
  const sessions = (rows ?? []) as unknown as SessionRow[];

  const attended = new Set((attendance ?? []).filter((a) => a.attended).map((a) => a.session_id));
  const now = Date.now();

  return sessions.map((r) => {
    const start = new Date(r.starts_at).getTime();
    const end = start + (r.duration_minutes ?? 60) * 60_000;

    return {
      id: r.id,
      speakerName: r.speaker_name,
      speakerTitle: r.speaker_title,
      topic: r.topic,
      description: r.description,
      startsAt: r.starts_at,
      durationMinutes: r.duration_minutes ?? 60,
      // The link only appears in the window around the session, so a stale
      // meeting URL is not sitting on the page all week (F16.2).
      joinUrl: r.join_url,
      replayUrl: r.replay_url,
      joinable: now >= start - 30 * 60_000 && now <= end + 30 * 60_000,
      past: now > end,
      attended: attended.has(r.id),
    };
  });
});
