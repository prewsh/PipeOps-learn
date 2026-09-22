import Link from "next/link";
import { notFound } from "next/navigation";
import { ModuleEditor } from "@/components/admin/ModuleEditor";
import { Meta } from "@/components/ui";
import { getModuleForEdit } from "@/lib/data/admin";

export default async function ModuleEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getModuleForEdit(slug);
  if (!m) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href={m.weekNumber ? `/admin/content/${m.weekNumber}` : "/admin/content"}
        className="text-sm"
      >
        ← Back to week
      </Link>

      <header>
        <Meta>
          {m.code}
          {m.weekNumber ? ` · Week ${m.weekNumber}` : ""}
        </Meta>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[36px]">
          {m.title}
        </h1>
      </header>

      <ModuleEditor module={m} />
    </div>
  );
}
