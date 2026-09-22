"use client";

import { useState } from "react";

/** Copies the filtered list's emails so the team can paste them into a mail
 *  client. This is the action that follows almost every filter (PRD F12.4). */
export function CopyEmails({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(emails.join(", "));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? `Copied ${emails.length}` : `Copy ${emails.length} emails`}
    </button>
  );
}
