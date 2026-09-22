"use client";

import { useActionState, useTransition } from "react";
import {
  Field,
  Select,
  Status,
  TextArea,
  TextInput,
  toCohortLocal,
} from "@/components/admin/Fields";
import { Button, Card, Meta } from "@/components/ui";
import {
  addResource,
  type ContentState,
  deleteResource,
  releaseWeekNow,
  saveTask,
  saveWeek,
} from "@/lib/actions/content";

type Week = {
  id: string;
  number: number;
  title: string;
  theme: string | null;
  overview: string | null;
  release_at: string;
  deadline_at: string;
  image_url: string | null;
};

type Task = {
  id: string;
  title: string;
  brief: string;
  submission_types: string[];
  deadline_at: string | null;
} | null;

type Material = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  url: string | null;
};

export function WeekEditor({
  week,
  task,
  materials,
  released,
}: {
  week: Week;
  task: Task;
  materials: Material[];
  released: boolean;
}) {
  const [weekState, weekAction, weekPending] = useActionState<ContentState, FormData>(
    saveWeek.bind(null, week.id),
    {},
  );
  const [taskState, taskAction, taskPending] = useActionState<ContentState, FormData>(
    saveTask.bind(null, week.id, task?.id ?? null),
    {},
  );
  const [resState, resAction, resPending] = useActionState<ContentState, FormData>(
    addResource.bind(null, "week", week.id),
    {},
  );
  const [releasing, startRelease] = useTransition();

  const types = task?.submission_types ?? ["url"];

  return (
    <div className="flex flex-col gap-6">
      <Card className="px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Meta>Week details</Meta>
          {!released ? (
            <Button
              variant="secondary"
              disabled={releasing}
              onClick={() => startRelease(async () => void (await releaseWeekNow(week.id)))}
            >
              {releasing ? "Opening…" : "Open this week now"}
            </Button>
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
              Open
            </span>
          )}
        </div>

        <form action={weekAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <TextInput name="title" defaultValue={week.title} required />
          </Field>
          <Field label="Theme">
            <TextInput name="theme" defaultValue={week.theme ?? ""} placeholder="Strategy" />
          </Field>
          <Field label="Opens (WAT)">
            <TextInput
              name="releaseAt"
              type="datetime-local"
              defaultValue={toCohortLocal(week.release_at)}
              required
            />
          </Field>
          <Field label="Deadline (WAT)">
            <TextInput
              name="deadlineAt"
              type="datetime-local"
              defaultValue={toCohortLocal(week.deadline_at)}
              required
            />
          </Field>
          <div className="md:col-span-2">
            <Field
              label="Cover image URL"
              hint="Shown on the week card in Learn. Any https image; Unsplash works well."
            >
              <TextInput
                name="imageUrl"
                defaultValue={week.image_url ?? ""}
                placeholder="https://images.unsplash.com/…"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Overview" hint="Shown at the top of the week for participants.">
              <TextArea name="overview" rows={3} defaultValue={week.overview ?? ""} />
            </Field>
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <Button type="submit" variant="primary" disabled={weekPending}>
              {weekPending ? "Saving…" : "Save week"}
            </Button>
            <Status state={weekState} />
          </div>
        </form>
      </Card>

      <Card className="px-5 py-5">
        <Meta>{task ? "Weekly task" : "Add a weekly task"}</Meta>
        <form action={taskAction} className="mt-4 flex flex-col gap-4">
          <Field label="Title">
            <TextInput name="title" defaultValue={task?.title ?? ""} required />
          </Field>
          <Field label="Brief" hint="What you write here is exactly what participants read.">
            <TextArea name="brief" rows={6} defaultValue={task?.brief ?? ""} required />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Deadline (WAT)" hint="Leave empty to use the week's deadline.">
              <TextInput
                name="deadlineAt"
                type="datetime-local"
                defaultValue={toCohortLocal(task?.deadline_at ?? null)}
              />
            </Field>
            <Field label="Accepts">
              <div className="flex gap-4 pt-2">
                {(["url", "text", "file"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 text-[15px] text-ink">
                    <input
                      type="checkbox"
                      name={`type_${t}`}
                      defaultChecked={types.includes(t)}
                      className="h-4 w-4"
                    />
                    {t}
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={taskPending}>
              {taskPending ? "Saving…" : task ? "Save task" : "Create task"}
            </Button>
            <Status state={taskState} />
          </div>
        </form>
      </Card>

      <Card className="px-5 py-5">
        <Meta>Week resources</Meta>
        {materials.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {materials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3">
                <a
                  href={m.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm"
                >
                  {m.title}
                </a>
                <RemoveResource id={m.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-2">Nothing attached to this week yet.</p>
        )}

        <form action={resAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_8rem_auto]">
          <TextInput name="title" placeholder="Title" required />
          <TextInput name="url" placeholder="https://…" required />
          <Select name="type" defaultValue="link">
            {["link", "pdf", "doc", "sheet", "template", "video", "image"].map((t) => (
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

export function RemoveResource({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await deleteResource(id)))}
      className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}
