"use client";

import { trackVideoEvent } from "@/lib/video-analytics";
import { youtubeWatchUrlAt } from "@/lib/youtube";
import { useRecipeVideoOptional } from "./RecipeVideoContext";

export function VideoTimestampLink({
  label,
  time,
  videoId,
  recipeSlug,
  recipeName,
  videoTitle,
}: {
  label: string;
  time: number;
  videoId: string;
  recipeSlug?: string;
  recipeName?: string;
  videoTitle?: string;
}) {
  const ctx = useRecipeVideoOptional();

  return (
    <button
      type="button"
      className="no-print mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:underline"
      onClick={() => {
        trackVideoEvent("recipe_video_timestamp_click", {
          recipeSlug,
          recipeName,
          videoId,
          videoTitle,
          source: "instruction_timestamp",
          timestamp: time,
          chapterLabel: label,
        });
        if (ctx) {
          ctx.expandWatchMethod({
            start: time,
            source: "instruction_timestamp",
            scroll: false,
          });
          return;
        }
        const url = youtubeWatchUrlAt(videoId, time);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
    >
      <span aria-hidden>▶</span> {label}
    </button>
  );
}
