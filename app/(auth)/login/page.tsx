"use client";

import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { Button, Meta } from "@/components/ui";
import { type AuthState, requestAccess } from "@/lib/auth/actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestAccess, {});

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <Logo height={28} />
      <Meta className="mt-5">UGC Programme</Meta>
      <h1 className="mt-4 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
        Sign in
      </h1>
      <p className="mt-3 text-base leading-[1.55] text-ink-2">
        Enter the email you applied with. We'll send you a link and a sign-in code — either one gets
        you in.
      </p>

      <form action={action} className="mt-8 flex flex-col gap-3">
        <label
          htmlFor="email"
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          // biome-ignore lint/a11y/noAutofocus: single-purpose sign-in screen — the field is the only interactive element, and focusing it removes a tap on mobile where most participants are
          autoFocus
          inputMode="email"
          placeholder="you@example.com"
          className="min-h-11 rounded-lg border border-line-strong bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-3"
        />

        {state.error ? (
          <p className="flex gap-2 text-sm leading-[1.5] text-ink" role="alert">
            <span aria-hidden className="font-mono font-medium">
              !
            </span>
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={pending} className="mt-2">
          {pending ? "Sending…" : "Send me a code"}
        </Button>
      </form>

      <p className="mt-8 text-sm text-ink-2">
        This programme is invite-only. Access comes from the accepted-participant list.
      </p>
    </main>
  );
}
