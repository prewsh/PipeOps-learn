import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * No CSP yet: the YouTube IFrame API injects inline script and styles, so a
 * meaningful policy needs nonces threaded through the player. Added without
 * that it would either break playback or be loose enough to be theatre. The
 * headers below are the ones that work today with no such trade-off.
 */
const securityHeaders = [
  // The app must never be framed — it would allow clickjacking a submission
  // or an admin approval.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never leak a token-bearing path to a third party.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: false },
  // Needed for the container image PipeOps builds.
  output: "standalone",

  images: {
    // Week cover images. Placeholders chosen per week and editable in admin,
    // so the host is allow-listed rather than the individual URLs.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Sign-in pages carry tokens in the query string; keep them out of
      // caches and out of referrers entirely.
      {
        source: "/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/verify",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
