"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Button, Meta } from "@/components/ui";
import {
  attachFile,
  removeFile,
  type SubmitResult,
  saveDraft,
  submitWork,
} from "@/lib/actions/submissions";
import type { Submission, WorkItem } from "@/lib/data/tasks";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * One form for both assignments and programme tasks (PRD F7.2).
 *
 * Contract shown to the participant, and honoured here: autosaves every 10
 * seconds and on blur, and a draft is not a submission. Lateness is computed
 * server-side at submit time, so the warning below is advisory — the database
 * decides.
 */

const AUTOSAVE_MS = 10_000;

export function SubmissionForm({
  item,
  enrollmentId,
  submissionsOpen,
}: {
  item: WorkItem;
  enrollmentId: string;
  submissionsOpen: boolean;
}) {
  const current = item.submission;
  const locked = current?.status === "approved";

  const wantsUrl = item.submissionTypes.includes("url");
  const wantsText = item.submissionTypes.includes("text");
  const wantsFile = item.submissionTypes.includes("file");

  const [urls, setUrls] = useState(current?.urls.join("\n") ?? "");
  const [text, setText] = useState(current?.textResponse ?? "");
  const [files, setFiles] = useState(current?.files ?? []);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const dirty = useRef(false);
  const submitAction = submitWork.bind(null, item.type, item.id);
  const [state, action, pending] = useActionState<SubmitResult, FormData>(submitAction, {});

  const isLateNow = item.deadlineAt ? new Date() > new Date(item.deadlineAt) : false;

  const persist = useCallback(async () => {
    if (!dirty.current || locked) return;
    dirty.current = false;
    const list = urls
      .split(/[\s,]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    const { ok, error } = await saveDraft(item.type, item.id, list, text);
    if (ok) {
      setSavedAt(new Date());
      setDraftError(null);
    } else {
      setDraftError(error ?? "Couldn't save your draft. Check your connection.");
    }
  }, [urls, text, item.type, item.id, locked]);

  useEffect(() => {
    const timer = setInterval(() => void persist(), AUTOSAVE_MS);
    return () => {
      clearInterval(timer);
      void persist();
    };
  }, [persist]);

  async function upload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setUploadError(null);

    if (files.length + fileList.length > item.maxFiles) {
      setUploadError(`Up to ${item.maxFiles} files.`);
      return;
    }

    setUploading(true);
    try {
      const list = urls
        .split(/[\s,]+/)
        .map((u) => u.trim())
        .filter(Boolean);
      const { submissionId } = await saveDraft(item.type, item.id, list, text);
      if (!submissionId) throw new Error("could not open a draft");

      const supabase = getBrowserSupabase();
      for (const file of Array.from(fileList)) {
        if (file.size > 25 * 1024 * 1024) {
          setUploadError(`${file.name} is over 25MB.`);
          continue;
        }
        const safe = file.name.replace(/[^\w.-]+/g, "_");
        const path = `${enrollmentId}/${submissionId}/${Date.now()}-${safe}`;

        const { error } = await supabase.storage.from("submissions").upload(path, file);
        if (error) {
          setUploadError(`${file.name}: ${error.message}`);
          continue;
        }

        const { id, error: attachError } = await attachFile(submissionId, {
          storagePath: path,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        if (!id) {
          setUploadError(`${file.name}: ${attachError ?? "could not be attached"}`);
          continue;
        }
        setFiles((prev) => [
          ...prev,
          { id, filename: file.name, storagePath: path, sizeBytes: file.size },
        ]);
      }
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  if (locked) {
    return <SubmittedView item={item} submission={current} />;
  }

  if (!submissionsOpen) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6">
        <Meta>Submissions open soon</Meta>
        <p className="mt-2 text-[15px] leading-[1.55] text-ink-2">
          Do the work now — you'll be able to submit it here shortly. The programme team will
          announce when the portal opens.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {wantsUrl ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="urls"
            className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3"
          >
            Public post link
          </label>
          <input
            id="urls"
            name="urls"
            value={urls}
            onChange={(e) => {
              setUrls(e.target.value);
              dirty.current = true;
            }}
            onBlur={() => void persist()}
            placeholder="https://linkedin.com/posts/..."
            inputMode="url"
            className="min-h-11 rounded-lg border border-line-strong bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-3"
          />
          {item.allowedPlatforms.length > 0 ? (
            <p className="text-sm text-ink-2">
              LinkedIn, X, TikTok, Instagram, Facebook or YouTube.
            </p>
          ) : null}
          <PlatformWarning urls={urls} allowed={item.allowedPlatforms} />
        </div>
      ) : null}

      {wantsText ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="text"
            className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3"
          >
            Your response
          </label>
          <textarea
            id="text"
            name="text"
            rows={10}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              dirty.current = true;
            }}
            onBlur={() => void persist()}
            className="rounded-lg border border-line-strong bg-surface p-4 text-base leading-[1.55] text-ink outline-none"
          />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink-2">
              Autosaves every 10s and on blur. A draft is not a submission.
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-3">
              {text.length}
              {item.textMax ? ` / ${item.textMax}` : ""}
            </span>
          </div>
          {item.textMin && text.length > 0 && text.length < item.textMin ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
              min {item.textMin}
            </p>
          ) : null}
        </div>
      ) : null}

      {wantsFile ? (
        <div className="flex flex-col gap-2">
          <Meta>Attachments</Meta>
          <label className="flex min-h-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-4 text-center">
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => void upload(e.target.files)}
              disabled={uploading}
            />
            <span className="text-sm text-ink-2">
              {uploading ? "Uploading…" : "Drop files or browse"}
              <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                max 25MB · up to {item.maxFiles} files
              </span>
            </span>
          </label>

          {files.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink">{f.filename}</span>
                  <button
                    type="button"
                    className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink"
                    onClick={async () => {
                      await removeFile(f.id);
                      setFiles((prev) => prev.filter((x) => x.id !== f.id));
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {uploadError ? (
            <p className="flex gap-2 text-sm text-ink">
              <span aria-hidden className="font-mono font-medium">
                !
              </span>
              {uploadError}
            </p>
          ) : null}
        </div>
      ) : null}

      {draftError ? (
        <p className="flex gap-2 text-sm text-ink" role="status">
          <span aria-hidden className="font-mono font-medium">
            !
          </span>
          {draftError}
        </p>
      ) : null}

      {state.error ? (
        <p className="flex gap-2 text-sm text-ink" role="alert">
          <span aria-hidden className="font-mono font-medium">
            !
          </span>
          {state.error}
        </p>
      ) : null}

      {isLateNow ? (
        <p className="flex gap-2 text-sm text-ink">
          <span aria-hidden className="font-mono font-medium">
            !
          </span>
          The deadline has passed. You can still submit — it will be marked late.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Submitting…" : current && current.status !== "draft" ? "Resubmit" : "Submit"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void persist()}>
          Save draft
        </Button>
        {savedAt ? (
          <span className="motion-enter font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
            Draft saved{" "}
            {savedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function PlatformWarning({ urls, allowed }: { urls: string; allowed: string[] }) {
  if (!allowed.length || !urls.trim()) return null;

  const offenders = urls
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean)
    .filter((u) => {
      try {
        const host = new URL(u).hostname.replace(/^www\./, "");
        return !allowed.some((p) => host === p || host.endsWith(`.${p}`));
      } catch {
        return false;
      }
    });

  if (!offenders.length) return null;

  // Warn, never block (PRD F7.3).
  return (
    <p className="flex gap-2 text-sm text-ink-2">
      <span aria-hidden className="font-mono font-medium">
        !
      </span>
      That doesn't look like one of the listed platforms. You can still submit it.
    </p>
  );
}

function SubmittedView({ item, submission }: { item: WorkItem; submission: Submission | null }) {
  if (!submission) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-5 py-4">
      <Meta>Approved · version {submission.version}</Meta>
      {submission.urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" className="break-all text-sm">
          {u}
        </a>
      ))}
      {submission.textResponse ? (
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-[1.55] text-ink">
          {submission.textResponse}
        </p>
      ) : null}
      {submission.reviewNote ? (
        <p className="border-t border-line pt-3 text-sm text-ink-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
            Reviewer
          </span>
          <br />
          {submission.reviewNote}
        </p>
      ) : null}
      <p className="text-sm text-ink-2">
        This {item.type === "assignment" ? "assignment" : "task"} is approved and closed.
      </p>
    </div>
  );
}
