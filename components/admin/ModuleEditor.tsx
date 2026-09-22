"use client";

import { useActionState } from "react";
import { Field, Select, Status, TextArea, TextInput } from "@/components/admin/Fields";
import { RemoveResource } from "@/components/admin/WeekEditor";
import { Button, Card, Meta } from "@/components/ui";
import { addResource, type ContentState, saveModule } from "@/lib/actions/content";

export function ModuleEditor({
  module: m,
}: {
  module: {
    id: string;
    code: string;
    title: string;
    summary: string;
    bullets: string[];
    minutes: number | null;
    lessonId: string | null;
    videoRef: string;
    materials: { id: string; title: string; url: string | null }[];
  };
}) {
  const [state, action, pending] = useActionState<ContentState, FormData>(
    saveModule.bind(null, m.id, m.lessonId),
    {},
  );
  const [resState, resAction, resPending] = useActionState<ContentState, FormData>(
    addResource.bind(null, "module", m.id),
    {},
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="px-5 py-5">
        <Meta>Module details</Meta>
        <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Title">
              <TextInput name="title" defaultValue={m.title} required />
            </Field>
          </div>
          <Field label="YouTube video" hint="Paste the id or the whole URL — either works.">
            <TextInput name="videoRef" defaultValue={m.videoRef} placeholder="w0EC3Cuw4yo" />
          </Field>
          <Field label="Length (minutes)">
            <TextInput
              name="estimatedMinutes"
              type="number"
              min={0}
              max={600}
              defaultValue={m.minutes ?? ""}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Summary">
              <TextArea name="summary" rows={2} defaultValue={m.summary} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="What you'll learn" hint="One bullet per line.">
              <TextArea name="whatYouWillLearn" rows={6} defaultValue={m.bullets.join("\n")} />
            </Field>
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save module"}
            </Button>
            <Status state={state} />
          </div>
        </form>
      </Card>

      <Card className="px-5 py-5">
        <Meta>Resources for this module</Meta>
        {m.materials.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {m.materials.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <a
                  href={r.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm"
                >
                  {r.title}
                </a>
                <RemoveResource id={r.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-2">Nothing attached yet.</p>
        )}

        <form action={resAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_8rem_auto]">
          <TextInput name="title" placeholder="Title" required />
          <TextInput name="url" placeholder="https://…" required />
          <Select name="type" defaultValue="pdf">
            {["pdf", "link", "doc", "sheet", "template", "video", "image"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={resPending}>
            {resPending ? "Adding…" : "Add"}
          </Button>
          <div className="md:col-span-4">
            <Status state={resState} />
          </div>
        </form>
      </Card>
    </div>
  );
}
