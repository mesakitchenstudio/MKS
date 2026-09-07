import type { FunnelPeriodMetrics, MetricAvailability } from "@/lib/content-performance/types";

/** Recipe → Video "opens": play + watch-on-YouTube (not subscribe/ended). */
export const RECIPE_TO_VIDEO_OPEN_NAMES = new Set([
  "recipe_video_play",
  "recipe_watch_on_youtube_click",
]);

export const VIDEO_TO_RECIPE_NAME = "video_to_recipe";

export type FunnelEventRow = {
  name: string;
  recipeId: string;
  recipeSlug: string;
  targetRecipeId: string;
  youtubeVideoId: string;
};

export function emptyFunnelMetrics(availability: MetricAvailability): FunnelPeriodMetrics {
  return {
    recipeToVideoOpens: availability === "zero" ? 0 : null,
    videoToRecipeClicks: availability === "zero" ? 0 : null,
    availability,
  };
}

export function aggregateFunnelForRecipe(
  events: FunnelEventRow[],
  recipeId: string,
): FunnelPeriodMetrics {
  let recipeToVideoOpens = 0;
  let videoToRecipeClicks = 0;
  for (const event of events) {
    if (RECIPE_TO_VIDEO_OPEN_NAMES.has(event.name) && event.recipeId === recipeId) {
      recipeToVideoOpens += 1;
      continue;
    }
    if (event.name === VIDEO_TO_RECIPE_NAME) {
      const target = event.targetRecipeId || event.recipeId;
      if (target === recipeId) videoToRecipeClicks += 1;
    }
  }
  return {
    recipeToVideoOpens,
    videoToRecipeClicks,
    availability: "available",
  };
}

export function sumRecipeToVideoOpens(events: FunnelEventRow[]): number {
  let n = 0;
  for (const event of events) {
    if (RECIPE_TO_VIDEO_OPEN_NAMES.has(event.name)) n += 1;
  }
  return n;
}
