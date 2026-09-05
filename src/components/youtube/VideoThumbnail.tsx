"use client";

import Image from "next/image";
import { useState } from "react";
import { normalizeRecipeImageSrc } from "@/lib/recipe-images";

export function VideoThumbnailFallback({ showPlay = false }: { showPlay?: boolean }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center bg-sand"
      aria-hidden
    >
      {showPlay ? (
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line/70 bg-paper/95 text-terracotta">
          <PlayIcon />
        </span>
      ) : null}
      <p
        className={`text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-olive/80 ${showPlay ? "mt-3" : ""}`}
      >
        Mesa Kitchen Studio
      </p>
    </div>
  );
}

export function VideoThumbnail({
  src,
  alt,
  showPlay = false,
  priority = false,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  aspectClassName = "aspect-video",
  playSize = "md",
  objectPositionClassName = "object-center",
}: {
  src?: string;
  alt: string;
  showPlay?: boolean;
  priority?: boolean;
  sizes?: string;
  aspectClassName?: string;
  /** Slightly smaller control for tall Shorts frames. */
  playSize?: "sm" | "md";
  objectPositionClassName?: string;
}) {
  const normalized = normalizeRecipeImageSrc(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const degraded = !normalized || failedSrc === normalized;
  const playFrame =
    playSize === "sm"
      ? "flex h-9 w-9 items-center justify-center rounded-full border border-paper/70 bg-paper/95 text-terracotta"
      : "flex h-10 w-10 items-center justify-center rounded-full border border-paper/70 bg-paper/95 text-terracotta";

  return (
    <div className={`relative overflow-hidden bg-sand ${aspectClassName}`}>
      {degraded ? (
        <VideoThumbnailFallback showPlay={showPlay} />
      ) : (
        <>
          <Image
            src={normalized}
            alt={alt}
            fill
            priority={priority}
            sizes={sizes}
            className={`object-cover ${objectPositionClassName} transition duration-500 motion-safe:group-hover/thumb:scale-[1.02] motion-reduce:transition-none motion-reduce:transform-none`}
            onError={() => setFailedSrc(normalized)}
          />
          {showPlay ? (
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/10 transition motion-safe:group-hover/thumb:bg-ink/15 motion-reduce:transition-none"
              aria-hidden
            >
              <span
                className={`${playFrame} transition motion-safe:group-hover/thumb:scale-105 motion-reduce:transform-none`}
              >
                <PlayIcon />
              </span>
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
      <path d="M9 7.5v9l7.5-4.5L9 7.5Z" fill="currentColor" />
    </svg>
  );
}
