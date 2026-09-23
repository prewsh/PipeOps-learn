import { LoginForm } from "./LoginForm";

/**
 * Sign-in (PRD F1.3). The page reads the reason someone was sent here; the
 * form itself is a client component.
 *
 * Without this, an expired or already-used sign-in link dropped the person
 * on a blank sign-in form with no idea why the link "didn't work".
 */
const NOTICES: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Enter your email and we'll send a fresh one.",
  "not-enrolled":
    "Your account isn't part of an active cohort right now. If that's a mistake, contact the programme team.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm notice={(error && NOTICES[error]) ?? null} />;
}
