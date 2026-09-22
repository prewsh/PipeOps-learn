"use client";

import { use, useActionState } from "react";
import { Button, Meta } from "@/components/ui";
import { type AuthState, verifyCode } from "@/lib/auth/actions";

export default function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = use(searchParams);
  const [state, action, pending] = useActionState<AuthState, FormData>(verifyCode, {});

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <Meta>Step 2 of 2</Meta>
      <h1 className="mt-4 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
        Check your email
      </h1>
      <p className="mt-3 text-base leading-[1.55] text-ink-2">
        We sent a sign-in code to{" "}
        <span className="font-mono text-[15px] text-ink">{email ?? "your inbox"}</span>. Enter it
        below, or tap the link in the email.
      </p>

      <form action={action} className="mt-8 flex flex-col gap-3">
        <input type="hidden" name="email" value={email ?? ""} />
        <label
          htmlFor="token"
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3"
        >
          Sign-in code
        </label>
        <input
          id="token"
          name="token"
          required
          // biome-ignore lint/a11y/noAutofocus: OTP entry screen — entering the code is the only action, and this pairs with autoComplete="one-time-code" autofill
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          pattern="\d{6,10}"
          placeholder="00000000"
          className="min-h-11 rounded-lg border border-line-strong bg-surface px-4 font-mono text-xl tracking-[0.3em] text-ink outline-none placeholder:text-ink-3"
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
          {pending ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>

      <a href="/login" className="mt-8 text-sm">
        Use a different email
      </a>
    </main>
  );
}
