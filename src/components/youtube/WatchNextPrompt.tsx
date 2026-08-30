"use client";

import Link from "next/link";
import type { WatchNextRecommendation } from "@/lib/youtube-data/watch-next-select";
import { trackVideoEvent } from "@/lib/video-analytics";

/** Compact prompt shown when the main embed finishes playing. */
export function WatchNextPrompt({
  next,
  recipeSlug,
  recipeName,
  sourceVideoId,
}: {
  next: WatchNextRecommendation;
  recipeSlug: string;
  recipeName: string;
  sourceVideoId?: string;
}) {
  const mesaHref = next.recipeSlug ? `/recipes/${next.recipeSlug}#studio-video` : null;

  function track() {
    trackVideoEvent("recipe_related_video_click", {
      recipeSlug,
      recipeName,
      videoId: sourceVideoId || next.videoId,
      videoTitle: next.title,
      relatedVideoId: next.videoId,
      targetRecipeSlug: next.recipeSlug,
      source: "watch_next",
    });
  }

  return (
    <div className="mt-4 border border-line bg-cream/50 px-4 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">Up next</p>
      <p className="mt-1 font-semibold text-ink">{next.title}</p>
      {mesaHref ? (
        <Link
          href={mesaHref}
          onClick={track}
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-terracotta hover:underline"
        >
          <span aria-hidden>▶</span> Watch next
        </Link>
      ) : (
        <a
          href={next.watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={track}
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-terracotta hover:underline"
        >
          <span aria-hidden>▶</span> Watch on YouTube
        </a>
      )}
    </div>
  );
}
