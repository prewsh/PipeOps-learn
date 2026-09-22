/**
 * Content-Security-Policy.
 *
 * Until now the only directive was `frame-ancestors 'none'`, because the
 * YouTube IFrame API injects script and style and a naive policy either breaks
 * playback or is loose enough to be decoration.
 *
 * The way through is `strict-dynamic`: scripts loaded *by* an already-trusted
 * script inherit that trust. Next's own bundles carry the per-request nonce,
 * our player code creates the YouTube API script tag, and that script is then
 * trusted without having to allow-list Google's shifting set of hosts. Modern
 * browsers ignore host allow-lists in the presence of `strict-dynamic`, so the
 * https: entries below are only a fallback for older ones.
 *
 * `style-src` keeps `unsafe-inline`. Tailwind emits inline styles for dynamic
 * values (the progress bar's width), the YouTube iframe injects its own, and
 * there is no nonce path through either. Inline style is a far weaker vector
 * than inline script, and pretending otherwise by shipping a policy that
 * breaks the product would be the worse trade.
 */
export function buildCsp(nonce: string, supabaseUrl: string, isDev: boolean): string {
  // This runs on every request. A missing or malformed value would otherwise
  // surface as "Invalid URL" from deep inside the proxy, which says nothing
  // about what to fix.
  let supabase: string;
  try {
    supabase = new URL(supabaseUrl).origin;
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is missing or not a URL; the CSP cannot be built without it.",
    );
  }
  const supabaseWs = supabase.replace(/^https:/, "wss:");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "https:",
      // Next's dev server compiles with eval. Never in a production build.
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://images.unsplash.com",
      "https://i.ytimg.com",
      // Session flyers and any other private-bucket image, fetched through a
      // short-lived signed URL on this project's storage host.
      supabase,
    ],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabase, supabaseWs, ...(isDev ? ["ws:"] : [])],
    "frame-src": ["https://www.youtube.com", "https://www.youtube-nocookie.com"],
    "media-src": ["'self'", "blob:", "https://*.googlevideo.com"],
    "worker-src": ["'self'", "blob:"],
    // The app must never be framed — it would allow clickjacking a submission
    // or an admin approval.
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}
