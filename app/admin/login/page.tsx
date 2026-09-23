"use client";

import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { Button, Meta } from "@/components/ui";
import { type AdminAuthState, adminSignIn } from "@/lib/auth/admin-actions";

/** Staff door. Deliberately plain and unlinked from the participant app. */
export default function AdminLoginPage() {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(adminSignIn, {});

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-16">
      <div className="flex flex-col items-center text-center">
        <Logo height={28} />
        <Meta className="mt-4">Admin</Meta>
      </div>

      <h1 className="mt-6 text-[26px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
        Staff sign-in
      </h1>
      <p className="mt-2 text-[15px] leading-[1.55] text-ink-2">
        For the programme team. Participants sign in at{" "}
        <a href="/login" className="whitespace-nowrap">
          /login
        </a>
        .
      </p>

      <form action={action} className="mt-7 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="email"
            className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className="min-h-11 rounded-lg border border-line-strong bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="password"
            className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="min-h-11 rounded-lg border border-line-strong bg-surface px-4 text-base text-ink outline-none"
          />
        </div>

        {state.error ? (
          <p className="flex gap-2 text-sm leading-[1.5] text-ink" role="alert">
            <span aria-hidden className="font-mono font-medium">
              !
            </span>
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={pending} className="mt-1">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
