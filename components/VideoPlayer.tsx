"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Meta } from "@/components/ui";
import { completeModule } from "@/lib/actions/progress";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * YouTube unlisted playback with our own progress tracking (PRD F5, ADR 0001).
 *
 * Three invariants this component exists to uphold:
 *  - watched_seconds ACCUMULATES from real playback ticks; scrubbing to the
 *    end is not watching, so we send a delta, never a position, for it.
 *  - progress is MONOTONIC — the RPC takes greatest(), so an out-of-order
 *    flush can never lower a stored maximum.
 *  - tracking NEVER blocks completion. If the IFrame API fails to load we
 *    fall back to a plain embed and the manual control still works (F5.8).
 */

type Props = {
  moduleId: string;
  slug: string;
  lessonId: string;
  videoRef: string | null;
  resumeAtSeconds: number;
  durationSeconds: number | null;
  alreadyComplete: boolean;
};

const FLUSH_INTERVAL_MS = 15_000;
const API_TIMEOUT_MS = 8_000;

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YTPlayer = {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (s: number, allow: boolean) => void;
  destroy: () => void;
};

export function VideoPlayer(props: Props) {
  const { lessonId, videoRef, resumeAtSeconds, durationSeconds } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  // Accumulated playback seconds not yet sent to the server.
  const pendingDelta = useRef(0);
  const lastTick = useRef<number | null>(null);
  const playing = useRef(false);

  const [degraded, setDegraded] = useState(false);
  const [showResume, setShowResume] = useState(resumeAtSeconds > 5 && !props.alreadyComplete);
  const [percent, setPercent] = useState(0);

  const flush = useCallback(
    async (ended = false) => {
      const player = playerRef.current;
      const delta = Math.round(pendingDelta.current);
      if (!player || (delta <= 0 && !ended)) return;
      pendingDelta.current = 0;

      try {
        const position = Math.round(player.getCurrentTime());
        const duration = Math.round(player.getDuration()) || durationSeconds || null;

        const supabase = getBrowserSupabase();
        const { data } = await supabase.rpc("record_video_progress", {
          p_lesson_id: lessonId,
          p_position_seconds: position,
          p_delta_seconds: delta,
          p_duration_seconds: duration,
          p_ended: ended,
        });

        const row = Array.isArray(data) ? data[0] : data;
        if (row?.percentage != null) setPercent(Number(row.percentage));
      } catch {
        // Offline or blocked — keep playing. Progress resumes on the next tick.
      }
    },
    [lessonId, durationSeconds],
  );

  useEffect(() => {
    if (!videoRef) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!playerRef.current && !cancelled) setDegraded(true);
    }, API_TIMEOUT_MS);

    const build = () => {
      if (cancelled || !mountRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId: videoRef,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => clearTimeout(timeout),
          onStateChange: (e: { data: number }) => {
            const YT = window.YT;
            if (!YT) return;

            if (e.data === YT.PlayerState.PLAYING) {
              playing.current = true;
              lastTick.current = Date.now();
            } else {
              if (playing.current && lastTick.current) {
                pendingDelta.current += (Date.now() - lastTick.current) / 1000;
              }
              playing.current = false;
              lastTick.current = null;
              void flush(e.data === YT.PlayerState.ENDED);
            }
          },
          onError: () => setDegraded(true),
        },
      });
    };

    if (window.YT?.Player) {
      build();
    } else {
      const existing = document.getElementById("yt-iframe-api");
      if (!existing) {
        const script = document.createElement("script");
        script.id = "yt-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        script.onerror = () => setDegraded(true);
        document.head.appendChild(script);
      }
      window.onYouTubeIframeAPIReady = build;
    }

    // Accumulate while playing, and flush on a fixed cadence (F5.3).
    const ticker = setInterval(() => {
      if (playing.current && lastTick.current) {
        pendingDelta.current += (Date.now() - lastTick.current) / 1000;
        lastTick.current = Date.now();
      }
      void flush();
    }, FLUSH_INTERVAL_MS);

    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(ticker);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      void flush();
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [videoRef, flush]);

  if (!videoRef) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-ink-surface px-6 text-center">
        <div>
          <Meta className="text-ink-3">Video coming soon</Meta>
          <p className="mt-2 text-sm text-white/70">
            This module's video hasn't been published yet. The materials below are available now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-ink-surface">
        {degraded ? (
          <iframe
            title="Module video"
            src={`https://www.youtube-nocookie.com/embed/${videoRef}?rel=0&modestbranding=1&playsinline=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <div ref={mountRef} className="h-full w-full" />
        )}
      </div>

      {showResume && !degraded ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
            Resume from {formatClock(resumeAtSeconds)}
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              onClick={() => {
                playerRef.current?.seekTo(resumeAtSeconds, true);
                setShowResume(false);
              }}
            >
              Resume
            </Button>
            <Button variant="ghost" onClick={() => setShowResume(false)}>
              Start over
            </Button>
          </div>
        </div>
      ) : null}

      {degraded ? (
        <p className="text-sm text-ink-2">
          Progress tracking is unavailable on this connection, so the video won't auto-complete. Use
          “Mark module complete” below when you're done — it always works.
        </p>
      ) : percent > 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
          Watched {Math.round(percent)}%
        </p>
      ) : null}
    </div>
  );
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Completion state (PRD F5.6, F8.1).
 *
 * Watching is what completes a module, so this reports progress rather than
 * offering a button. The manual control appears only when tracking is
 * unavailable — otherwise a participant whose player is blocked can never
 * finish anything (F5.8).
 */
export function ModuleCompletion({
  moduleId,
  slug,
  complete,
  percentWatched,
  trackingUnavailable,
}: {
  moduleId: string;
  slug: string;
  complete: boolean;
  percentWatched: number;
  trackingUnavailable: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(complete);

  if (done) {
    return (
      <div className="flex min-h-11 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink" aria-hidden />
        Module complete
      </div>
    );
  }

  if (trackingUnavailable) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Button
          variant="primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const result = await completeModule(moduleId, slug, "manual");
            setSaving(false);
            if (!result.error) setDone(true);
          }}
        >
          {saving ? "Saving…" : "Mark module complete"}
        </Button>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
          Tracking unavailable here
        </span>
      </div>
    );
  }

  const pct = Math.min(Math.round(percentWatched), 100);

  return (
    <div className="flex items-center gap-3">
      <div className="h-1 w-24 overflow-hidden rounded-full bg-line-strong" aria-hidden>
        <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
        {pct}% watched · completes at 90%
      </span>
    </div>
  );
}
