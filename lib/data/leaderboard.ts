import { cache } from "react";
import { unwrap } from "@/lib/data/query";
import { getSupabase } from "@/lib/supabase/server";

/**
 * Leaderboard reads (PRD F10).
 *
 * Everything here comes from SECURITY DEFINER functions that expose display
 * name, points and streak only — never submissions or email addresses.
 */

export type BoardRow = {
  rank: number;
  displayName: string;
  points: number;
  streak: number;
  weeksCompleted: number;
  isMe: boolean;
};

export type ConsistentRow = {
  rank: number;
  displayName: string;
  weeksCompleted: number;
  onTimeRate: number;
  isMe: boolean;
};

export const getLeaderboard = cache(async (): Promise<BoardRow[]> => {
  const supabase = await getSupabase();
  const { data } = await supabase.rpc("leaderboard", { p_limit: 25 });

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    rank: Number(r.rank),
    displayName: String(r.display_name ?? ""),
    points: Number(r.points_total ?? 0),
    streak: Number(r.streak_weeks ?? 0),
    weeksCompleted: Number(r.weeks_completed ?? 0),
    isMe: Boolean(r.is_me),
  }));
});

export const getConsistentBoard = cache(async (): Promise<ConsistentRow[]> => {
  const supabase = await getSupabase();
  const { data } = await supabase.rpc("leaderboard_consistent", { p_limit: 10 });

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    rank: Number(r.rank),
    displayName: String(r.display_name ?? ""),
    weeksCompleted: Number(r.weeks_completed ?? 0),
    onTimeRate: Number(r.on_time_rate ?? 0),
    isMe: Boolean(r.is_me),
  }));
});

/** The caller's own standing plus a per-rule breakdown of how they earned it. */
export const getMyStanding = cache(async () => {
  const supabase = await getSupabase();

  const [boardRes, activeCountRes, eventsRes] = await Promise.all([
    supabase.rpc("leaderboard", { p_limit: 25 }),
    supabase.rpc("active_creator_count"),
    supabase.from("points_events").select("rule, points"),
  ]);
  const board = unwrap(boardRes, "the leaderboard");
  const activeCount = unwrap(activeCountRes, "the active creator count");
  const events = unwrap(eventsRes, "your points");

  const mine = ((board ?? []) as Record<string, unknown>[]).find((r) => r.is_me);

  const byRule = new Map<string, { count: number; points: number }>();
  for (const e of (events ?? []) as { rule: string; points: number }[]) {
    const acc = byRule.get(e.rule) ?? { count: 0, points: 0 };
    // A reversal carries negative points and should not inflate the count.
    if (e.points > 0) acc.count += 1;
    acc.points += e.points;
    byRule.set(e.rule, acc);
  }

  return {
    rank: mine ? Number(mine.rank) : null,
    points: mine ? Number(mine.points_total) : 0,
    streak: mine ? Number(mine.streak_weeks) : 0,
    activeCreators: Number(activeCount ?? 0),
    breakdown: [...byRule.entries()]
      .map(([rule, v]) => ({ rule, ...v }))
      .sort((a, b) => b.points - a.points),
  };
});

const RULE_LABEL: Record<string, string> = {
  MODULE_COMPLETED: "Modules completed",
  ASSIGNMENT_SUBMITTED: "Assignments submitted",
  TASK_SUBMITTED: "Weekly tasks submitted",
  ON_TIME_BONUS: "On-time bonuses",
  WEEK_MODULES_COMPLETE: "Week module bonuses",
  WEEK_COMPLETE: "Weeks completed",
  SESSION_ATTENDED: "Sessions attended",
  FINAL_PROJECT_APPROVED: "Final project",
};

export function ruleLabel(rule: string): string {
  return RULE_LABEL[rule] ?? rule;
}
