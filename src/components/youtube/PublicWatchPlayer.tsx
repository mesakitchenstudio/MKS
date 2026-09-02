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
}: {
  videoId: string;
  title: string;
  thumbnail: string;
  duration?: string;
  embeddable: boolean;
  youtubeWatchUrl: string;
}) {
  if (!embeddable) {
    return (
      <a
        href={youtubeWatchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group/thumb relative block aspect-video overflow-hidden border border-line bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        aria-label={`Watch ${title} on YouTube (opens in a new tab)`}
      >
        <Image
          src={thumbnail}
          alt=""
          fill
          sizes="(min-width: 768px) 56rem, 100vw"
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
    <div className="aspect-video overflow-hidden border border-line bg-ink">
      <YouTubeEmbedFacade
        videoId={videoId}
        title={title}
        thumbnail={thumbnail}
        duration={duration}
      />
    </div>
  );
}
