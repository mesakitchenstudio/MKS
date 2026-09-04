"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

type SeriesTrackEvent =
  | "series_item_click"
  | "series_watch_click"
  | "series_watch_playlist_on_youtube_click";

export function SeriesItemTrackLink({
  href,
  children,
  className,
  event,
  seriesId,
  seriesSlug,
  itemPosition,
  destinationRecipeSlug,
  destinationVideoId,
  playlistId,
  placement,
  external = false,
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  event: SeriesTrackEvent;
  seriesId: string;
  seriesSlug: string;
  itemPosition?: number;
  destinationRecipeSlug?: string;
  destinationVideoId?: string;
  playlistId?: string;
  placement?: string;
  external?: boolean;
  ariaLabel?: string;
}) {
  function onClick() {
    trackEvent(event, {
      series_id: seriesId,
      series_slug: seriesSlug,
      item_position: itemPosition,
      target_recipe_slug: destinationRecipeSlug,
      related_video_id: destinationVideoId,
      playlist_id: playlistId,
      source: placement || "series_page",
    });
  }

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
