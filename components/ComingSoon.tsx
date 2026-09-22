import type { ReactNode } from "react";
import { Meta } from "@/components/ui";

/**
 * Coming-soon state for a section that is built but not switched on yet.
 *
 * Monochrome, like everything else — the cat is ink on canvas and the only
 * colour on the page stays on the link. The animation is CSS-only (no JS, no
 * library) and is disabled entirely under prefers-reduced-motion.
 */
export function ComingSoon({
  section,
  title,
  detail,
  children,
}: {
  section: string;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-10 text-center">
      <WaitingCat />

      <div className="max-w-[46ch]">
        <Meta>{section}</Meta>
        <h1 className="mt-3 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[34px]">
          {title}
        </h1>
        <p className="mt-3 text-base leading-[1.55] text-ink-2">{detail}</p>
      </div>

      {children}
    </div>
  );
}

function WaitingCat() {
  return (
    <div className="relative">
      <style>{`
        @keyframes pl-wag {
          0%, 100% { transform: rotate(-16deg); }
          50%      { transform: rotate(24deg); }
        }
        @keyframes pl-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          95%           { transform: scaleY(0.1); }
        }
        @keyframes pl-breathe {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
        @keyframes pl-ear {
          0%, 88%, 100% { transform: rotate(0deg); }
          93%           { transform: rotate(-9deg); }
        }
        .pl-tail    { transform-origin: 150px 150px; animation: pl-wag 1.5s ease-in-out infinite; }
        .pl-eyes    { transform-origin: center; animation: pl-blink 4.2s ease-in-out infinite; }
        .pl-body    { animation: pl-breathe 3.4s ease-in-out infinite; }
        .pl-ear-l   { transform-origin: 78px 74px; animation: pl-ear 5.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .pl-tail, .pl-eyes, .pl-body, .pl-ear-l { animation: none; }
        }
      `}</style>

      <svg
        viewBox="0 0 220 190"
        width="230"
        height="199"
        role="img"
        aria-label="A cat sitting, waiting, wagging its tail"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-ink"
      >
        <title>A cat sitting and waiting, tail wagging</title>

        {/* tail — wags from where it meets the body */}
        <path className="pl-tail" d="M150 150c22 4 34-8 30-24-3-12-16-13-19-3-2 8 6 12 11 6" />

        <g className="pl-body">
          {/* haunches and front legs */}
          <path d="M60 150c0-26 14-44 34-44h12c20 0 34 18 34 44z" />
          <path d="M80 150v-14M124 150v-14" />

          {/* head */}
          <path d="M78 74c0-16 14-28 32-28s32 12 32 28c0 17-14 30-32 30S78 91 78 74z" />

          {/* ears */}
          <path className="pl-ear-l" d="M80 70l-6-20 20 9" />
          <path d="M140 70l6-20-20 9" />

          {/* eyes */}
          <g className="pl-eyes">
            <path d="M98 72v5M122 72v5" />
          </g>

          {/* nose, mouth, whiskers */}
          <path d="M110 84l-4 4h8z" />
          <path d="M110 88v4" />
          <path d="M70 78h-14M70 86h-13M150 78h14M150 86h13" strokeWidth="2.4" />
        </g>

        {/* ground line */}
        <path d="M44 150h132" className="text-line-strong" strokeWidth="3" />
      </svg>
    </div>
  );
}
