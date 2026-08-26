"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackVideoMilestone } from "@/lib/video-analytics";
import { youtubeEmbedUrl } from "@/lib/youtube";

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
  const [loaded, setLoaded] = useState(false);
  const playStartedRef = useRef(false);
  const completeSentRef = useRef(false);
  const embed = youtubeEmbedUrl(videoId, {
    autoplay: loaded,
    start: startSeconds,
    enableApi: true,
  });

  const beginPlayback = useCallback(() => {
    if (!playStartedRef.current) {
      playStartedRef.current = true;
      onPlayStart?.();
    }
    setLoaded(true);
  }, [onPlayStart]);

  useEffect(() => {
    if (!forceLoad || loaded) return;
    beginPlayback();
  }, [beginPlayback, forceLoad, loaded]);

  useEffect(() => {
    if (!loaded || !analytics) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
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
      if (elapsed >= 55 && !completeSentRef.current) {
        completeSentRef.current = true;
        trackVideoMilestone(100, payload);
        onNearComplete?.();
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [analytics, loaded, onNearComplete, videoId]);

  if (loaded && embed) {
    return (
      <iframe
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
