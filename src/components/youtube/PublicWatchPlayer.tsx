"use client";

import Image from "next/image";
import { YouTubeEmbedFacade } from "@/components/youtube/YouTubeEmbedFacade";

/** Standalone watch-page player — facade first, iframe only after Play. */
export function PublicWatchPlayer({
  videoId,
  title,
  thumbnail,
  duration,
  embeddable,
  youtubeWatchUrl,
  portrait = false,
}: {
  videoId: string;
  title: string;
  thumbnail: string;
  duration?: string;
  embeddable: boolean;
  youtubeWatchUrl: string;
  /** Portrait-friendly frame for Shorts; landscape 16:9 otherwise. */
  portrait?: boolean;
}) {
  const frameClass = portrait
    ? "mx-auto aspect-[9/16] w-full max-w-[22rem] overflow-hidden border border-line bg-ink sm:max-w-sm"
    : "aspect-video overflow-hidden border border-line bg-ink";

  if (!embeddable) {
    return (
      <a
        href={youtubeWatchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`group/thumb relative block bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta ${
          portrait
            ? "mx-auto aspect-[9/16] w-full max-w-[22rem] overflow-hidden border border-line sm:max-w-sm"
            : "aspect-video overflow-hidden border border-line"
        }`}
        aria-label={`Watch ${title} on YouTube (opens in a new tab)`}
      >
        <Image
          src={thumbnail}
          alt=""
          fill
          sizes={portrait ? "(min-width: 640px) 24rem, 90vw" : "(min-width: 768px) 56rem, 100vw"}
          className="object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-ink/25">
          <span className="rounded-full bg-paper/95 px-5 py-3 text-sm font-semibold text-terracotta shadow-lg">
            Watch on YouTube ↗
          </span>
        </span>
      </a>
    );
  }

  return (
    <div className={frameClass} data-watch-layout={portrait ? "short" : "long"}>
      <YouTubeEmbedFacade
        videoId={videoId}
        title={title}
        thumbnail={thumbnail}
        duration={duration}
      />
    </div>
  );
}
