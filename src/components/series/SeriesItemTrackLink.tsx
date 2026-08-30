"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

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
  external = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  event: "series_item_click" | "series_watch_click";
  seriesId: string;
  seriesSlug: string;
  itemPosition: number;
  destinationRecipeSlug?: string;
  destinationVideoId?: string;
  external?: boolean;
}) {
  function onClick() {
    trackEvent(event, {
      series_id: seriesId,
      series_slug: seriesSlug,
      item_position: itemPosition,
      target_recipe_slug: destinationRecipeSlug,
      related_video_id: destinationVideoId,
      source: "series_page",
    });
  }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
