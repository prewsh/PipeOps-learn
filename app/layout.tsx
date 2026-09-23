import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

/**
 * IBM Plex is the project's typeface (docs/DESIGN.md section 2).
 * Sans carries what a human wrote; Mono carries every number a participant is
 * judged by — deadlines, points, ranks, module codes, percentages.
 */
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PipeOps Learn",
  description: "PipeOps UGC Program — learn, create, submit, publish, measure, improve.",
};

// Mobile-first: 360px floor, most participants are on phones. The theme
// colour follows the OS so the browser chrome matches before any choice.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A saved choice is applied on the server, so the first paint is already in
  // the right theme. No choice means no attribute, and the OS decides.
  const saved = (await cookies()).get("theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : undefined;

  return (
    <html lang="en" data-theme={theme} className={`${sans.variable} ${mono.variable}`}>
      {/*
        Browser extensions write their own attributes onto <body> before React
        hydrates — Grammarly adds data-gr-ext-installed, and the resulting
        mismatch is reported as a hydration error on every page. It is not our
        markup and we cannot prevent it, so the warning is noise that buries
        real ones. This suppresses the attribute comparison on this element
        only; children still hydrate normally.
      */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
