import { Card, EmptyState, Meta } from "@/components/ui";
import { getLibraryResources } from "@/lib/data/program";

/**
 * The resource library (PRD F17).
 *
 * Extras the team adds for everyone — templates, checklists, brand assets.
 * Course material does NOT live here: a module's resources sit on that
 * module's page, next to the video they belong to.
 */
export default async function ResourcesPage() {
  const resources = await getLibraryResources();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Meta>Resources</Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[36px]">
          Templates and extras
        </h1>
        <p className="mt-2 max-w-[52ch] text-base leading-[1.55] text-ink-2">
          Things the team has added for everyone. Material for a specific module lives on that
          module's page, with its video.
        </p>
      </header>

      {resources.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          detail="Templates, checklists and brand assets will appear here as the team adds them."
        />
      ) : (
        <Card className="overflow-hidden">
          {resources.map((m) => (
            <a
              key={m.id}
              href={m.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-5 py-3 no-underline last:border-b-0 hover:bg-fill-subtle"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-ink">{m.title}</span>
                {m.description ? (
                  <span className="mt-0.5 block truncate text-sm text-ink-2">{m.description}</span>
                ) : null}
              </span>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                {m.type}
              </span>
            </a>
          ))}
        </Card>
      )}
    </div>
  );
}
