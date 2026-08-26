"use client";

import type { RecipeYoutubeRelatedVideo } from "@/data/youtube-types";
import { trackVideoEvent } from "@/lib/video-analytics";

export function WatchNextPrompt({
  next,
  recipeSlug,
  recipeName,
}: {
  next: RecipeYoutubeRelatedVideo;
  recipeSlug: string;
  recipeName: string;
}) {
  return (
    <div className="mt-4 border border-line bg-cream/50 px-4 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">Up next</p>
      <p className="mt-1 font-semibold text-ink">{next.title}</p>
      <a
        href={next.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          trackVideoEvent("recipe_related_video_click", {
            recipeSlug,
            recipeName,
            videoId: next.videoId,
            videoTitle: next.title,
            source: "watch_next",
          })
        }
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-terracotta hover:underline"
      >
        <span aria-hidden>▶</span> Watch on YouTube
      </a>
    </div>
  );
}
