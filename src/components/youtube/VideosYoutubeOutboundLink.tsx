"use client";

import type { ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

const focusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/** Restrained outbound YouTube link with catalogue/watch analytics. */
export function VideosYoutubeOutboundLink({
  href,
  children,
  placement,
  videoId,
  format,
  className = "",
}: {
  href: string;
  children: ReactNode;
  placement: string;
  videoId?: string;
  format?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        trackEvent("videos_youtube_outbound_click", {
          placement,
          video_id: videoId,
          source: format,
        })
      }
      className={`${className} ${focusRing}`}
    >
      {children}
    </a>
  );
}
