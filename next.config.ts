import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The Content-Security-Policy is NOT here: it carries a per-request nonce, so
 * it is built in middleware.ts (lib/csp.ts). A static copy in this file would
 * be a second policy competing with that one.
 */
const securityHeaders = [
  // The app must never be framed — it would allow clickjacking a submission
  // or an admin approval. Kept alongside frame-ancestors for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
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
