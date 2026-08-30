"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { trackVideoEvent, trackVideoMilestone } from "@/lib/video-analytics";
import { youtubeEmbedUrl } from "@/lib/youtube";
import { loadYouTubeIframeApi, YT_PLAYER_STATE } from "@/lib/youtube-iframe-api";

type Props = {
  videoId: string;
  title: string;
  thumbnail: string;
  duration?: string;
  startSeconds?: number;
  forceLoad?: boolean;
  className?: string;
  onPlayStart?: () => void;
  onNearComplete?: () => void;
  analytics?: {
    recipeSlug: string;
    recipeName: string;
    videoTitle: string;
  };
};

export function YouTubeEmbedFacade({
  videoId,
  title,
  thumbnail,
  duration,
  startSeconds = 0,
  forceLoad = false,
  className = "",
  onPlayStart,
  onNearComplete,
  analytics,
}: Props) {
  const reactId = useId();
  const iframeDomId = `mesa-yt-${reactId.replace(/:/g, "")}`;
  const [loaded, setLoaded] = useState(false);
  const playStartedRef = useRef(false);
  const endedSentRef = useRef(false);
  const playerRef = useRef<{ destroy?: () => void } | null>(null);
  const onPlayStartRef = useRef(onPlayStart);
  const onNearCompleteRef = useRef(onNearComplete);
  const analyticsRef = useRef(analytics);

  useEffect(() => {
    onPlayStartRef.current = onPlayStart;
    onNearCompleteRef.current = onNearComplete;
    analyticsRef.current = analytics;
  }, [analytics, onNearComplete, onPlayStart]);

  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const embed = youtubeEmbedUrl(videoId, {
    autoplay: loaded,
    start: startSeconds,
    enableApi: true,
    origin,
  });

  const beginPlayback = useCallback(() => {
    // Load iframe only — PLAYING from the IFrame API records the play event.
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!forceLoad || loaded) return;
    beginPlayback();
  }, [beginPlayback, forceLoad, loaded]);

  useEffect(() => {
    if (!loaded || !embed) return;
    let cancelled = false;

    void loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled) return;
        const el = document.getElementById(iframeDomId);
        if (!el) return;

        playerRef.current?.destroy?.();
        playerRef.current = new YT.Player(iframeDomId, {
          events: {
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING || event.data === YT_PLAYER_STATE.PLAYING) {
                if (!playStartedRef.current) {
                  playStartedRef.current = true;
                  onPlayStartRef.current?.();
                }
              }
              if (event.data === YT.PlayerState.ENDED || event.data === YT_PLAYER_STATE.ENDED) {
                if (endedSentRef.current) return;
                endedSentRef.current = true;
                const a = analyticsRef.current;
                if (a) {
                  trackVideoEvent("recipe_video_complete", {
                    recipeSlug: a.recipeSlug,
                    recipeName: a.recipeName,
                    videoId,
                    videoTitle: a.videoTitle,
                    source: "main_embed",
                  });
                  // Keep milestone set for Plausible listeners that expect complete.
                  trackVideoMilestone(100, {
                    recipeSlug: a.recipeSlug,
                    recipeName: a.recipeName,
                    videoId,
                    videoTitle: a.videoTitle,
                    source: "main_embed",
                  });
                }
                onNearCompleteRef.current?.();
              }
            },
          },
        });
      })
      .catch(() => {
        // If the API fails to load, fall back so click-to-load still records a play once.
        if (!playStartedRef.current) {
          playStartedRef.current = true;
          onPlayStartRef.current?.();
        }
      });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [embed, iframeDomId, loaded, videoId]);

  // Optional Plausible mid-roll milestones (not used for funnel play/ended).
  useEffect(() => {
    if (!loaded || !analytics || !playStartedRef.current) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (!playStartedRef.current) return;
      const elapsed = (Date.now() - started) / 1000;
      const payload = {
        recipeSlug: analytics.recipeSlug,
        recipeName: analytics.recipeName,
        videoId,
        videoTitle: analytics.videoTitle,
        source: "main_embed" as const,
      };
      if (elapsed >= 15) trackVideoMilestone(25, payload);
      if (elapsed >= 30) trackVideoMilestone(50, payload);
      if (elapsed >= 45) trackVideoMilestone(75, payload);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [analytics, loaded, videoId]);

  if (loaded && embed) {
    return (
      <iframe
        id={iframeDomId}
        src={embed}
        title={title}
        className={`h-full w-full ${className}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    );
  }

  const durationLabel = duration ? `Watch ${duration}` : null;

  return (
    <button
      type="button"
      className={`group relative h-full w-full overflow-hidden bg-ink text-left ${className}`}
      onClick={beginPlayback}
      aria-label={duration ? `Play video: ${title}, ${duration}` : `Play video: ${title}`}
    >
      <Image
        src={thumbnail}
        alt=""
        fill
        sizes="(min-width: 768px) 48rem, 100vw"
        className="object-cover opacity-90 motion-safe:transition motion-safe:duration-300 motion-safe:group-hover:scale-[1.02] group-hover:opacity-100"
      />
      <span className="absolute inset-0 bg-ink/20 motion-safe:transition group-hover:bg-ink/30" />
      {duration ? (
        <span className="absolute bottom-3 right-3 rounded bg-ink/75 px-2 py-0.5 text-xs font-semibold text-paper sm:hidden">
          {duration}
        </span>
      ) : null}
      <span className="absolute inset-0 flex items-center justify-center px-4">
        {durationLabel ? (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-paper/95 text-terracotta shadow-lg motion-safe:transition motion-safe:group-hover:scale-105 sm:group-hover:scale-100 sm:group-hover:opacity-0 sm:group-focus-visible:opacity-0">
              <span className="ml-1 text-xl" aria-hidden>
                ▶
              </span>
            </span>
            <span className="pointer-events-none absolute hidden rounded-full bg-paper/95 px-5 py-3 text-sm font-semibold text-terracotta shadow-lg sm:block sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
              {durationLabel}
            </span>
          </>
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-paper/95 text-terracotta shadow-lg motion-safe:transition motion-safe:group-hover:scale-105">
            <span className="ml-1 text-xl" aria-hidden>
              ▶
            </span>
          </span>
        )}
      </span>
    </button>
  );
}
