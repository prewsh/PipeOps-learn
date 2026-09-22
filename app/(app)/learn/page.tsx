import { Meta } from "@/components/ui";
import { WeekCard } from "@/components/WeekCard";
import { getWeeks } from "@/lib/data/program";

/** Weeks are the primary path through the programme (PRD section 6). */
export default async function LearnPage() {
  const weeks = await getWeeks();

  return (
    <div className="flex flex-col gap-7">
      <header className="max-w-[62ch]">
        <Meta>The programme</Meta>
        <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-ink md:text-[40px]">
          {weeks.length} weeks
        </h1>
        <p className="mt-3 text-base leading-[1.55] text-ink-2">
          Each week unlocks on its release date. Once a week is open it stays open — nothing
          re-locks, and you're never blocked by an earlier week.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {weeks.map((w) => (
          <WeekCard key={w.id} week={w} />
        ))}
      </div>
    </div>
  );
}
