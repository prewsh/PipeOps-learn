import { type NextRequest, NextResponse } from "next/server";
import { getParticipants, type HealthState, isAdmin } from "@/lib/data/admin";

/** CSV export for end-of-programme reporting (PRD F12.7). */
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("Not found", { status: 404 });

  const health = request.nextUrl.searchParams.get("health") as HealthState | null;
  const rows = await getParticipants({ health: health ?? undefined });

  const header = [
    "name",
    "email",
    "status",
    "health",
    "progress_pct",
    "weeks_completed",
    "submissions",
    "current_week_task",
    "last_active_at",
  ];

  const csvCell = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const body = rows
    .map((r) =>
      [
        r.name,
        r.email,
        r.status,
        r.health,
        r.progressPct,
        r.weeksCompleted,
        r.submissionCount,
        r.currentWeekTask,
        r.lastActiveAt ?? "",
      ]
        .map(csvCell)
        .join(","),
    )
    .join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`${header.join(",")}\n${body}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cohort-01-participants-${stamp}.csv"`,
    },
  });
}
