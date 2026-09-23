"use client";

/**
 * Light / dark switch.
 *
 * The choice is written to a `theme` cookie that the root layout reads, so
 * the server renders the chosen theme and the page never flashes the wrong
 * one on load. With no cookie the OS preference applies (app/globals.css).
 *
 * Which icon shows is decided by CSS, not state: the server cannot know the
 * OS preference, and rendering an icon from JS state would mismatch on
 * hydration. The current theme is read at the moment of the click instead.
 */
const ONE_YEAR = 60 * 60 * 24 * 365;

function currentTheme(): "light" | "dark" {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Switch between light and dark mode"
      title="Light / dark mode"
      onClick={() => {
        const next = currentTheme() === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        // A display preference, nothing more — no reason to scope it tighter.
        // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is missing in Safari, and most participants are on iPhones
        document.cookie = `theme=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
      }}
      className={`motion-fast inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-fill-subtle hover:text-ink ${className}`}
    >
      {/* Shown in light mode: switches to dark. */}
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="dark:hidden"
        aria-hidden
      >
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
      {/* Shown in dark mode: switches to light. */}
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        className="hidden dark:block"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
      </svg>
    </button>
  );
}
