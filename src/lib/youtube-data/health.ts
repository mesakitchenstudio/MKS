import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";
import type { YouTubeContentHealthIssue, YouTubeVideoRowStatus } from "@/lib/youtube-data/types";
import {
  buildRecipeVideoIndex,
  recipeHasSavedChapters,
  titlesDifferSignificantly,
} from "@/lib/youtube-data/matching";
import { getDb } from "@/lib/db";

export function videoRowStatus(input: {
  privacyStatus: string;
  embeddable: boolean;
  linkedRecipeId?: string;
  hasDescriptionChapters: boolean;
  hasRecipeChapters: boolean;
}): YouTubeVideoRowStatus {
  if (input.privacyStatus && input.privacyStatus !== "public") return "Unavailable";
  if (!input.embeddable) return "Not embeddable";
  if (!input.linkedRecipeId) return "No recipe";
  if (!input.hasDescriptionChapters && !input.hasRecipeChapters) return "Missing chapters";
  return "Healthy";
}

export async function buildYoutubeContentHealth(): Promise<YouTubeContentHealthIssue[]> {
  const db = getDb();
  const [{ byVideoId, recipesWithoutVideo, recipes }, videos] = await Promise.all([
    buildRecipeVideoIndex(),
    db.youTubeVideo.findMany({ orderBy: { publishedAt: "desc" } }),
  ]);

  const issues: YouTubeContentHealthIssue[] = [];

  for (const video of videos) {
    const link = byVideoId.get(video.videoId);
    if (!link) {
      issues.push({
        id: `video-no-recipe-${video.videoId}`,
        label: `YouTube video “${video.title}” has no Mesa recipe`,
        href: `/admin/youtube/videos/${video.videoId}`,
        kind: "video",
      });
      continue;
    }

    const recipe = recipes.find((row) => row.id === link.recipeId);
    const descriptionChapters = parseYoutubeDescriptionChapters(video.description);
    const hasRecipeChapters = recipe ? recipeHasSavedChapters(recipe) : false;

    if (!descriptionChapters.length && !hasRecipeChapters) {
      issues.push({
        id: `video-no-chapters-${video.videoId}`,
        label: `“${video.title}” has no usable chapters`,
        href: `/admin/youtube/videos/${video.videoId}`,
        kind: "video",
      });
    }

    if (recipe && titlesDifferSignificantly(video.title, recipe.title)) {
      issues.push({
        id: `title-diff-${video.videoId}`,
        label: `Title differs: video “${video.title}” vs recipe “${recipe.title}”`,
        href: `/admin/recipes/${recipe.id}`,
        kind: "recipe",
      });
    }

    if (video.privacyStatus !== "public") {
      issues.push({
        id: `video-unavailable-${video.videoId}`,
        label: `Recipe “${link.recipeTitle}” links to a non-public video`,
        href: `/admin/recipes/${link.recipeId}`,
        kind: "recipe",
      });
    }

    if (!video.embeddable) {
      issues.push({
        id: `video-not-embeddable-${video.videoId}`,
        label: `Recipe “${link.recipeTitle}” links to a non-embeddable video`,
        href: `/admin/recipes/${link.recipeId}`,
        kind: "recipe",
      });
    }

    if (!video.thumbnailUrl.trim()) {
      issues.push({
        id: `video-no-thumb-${video.videoId}`,
        label: `“${video.title}” has no usable thumbnail`,
        href: `/admin/youtube/videos/${video.videoId}`,
        kind: "video",
      });
    }

    if (descriptionChapters.length && !hasRecipeChapters) {
      issues.push({
        id: `recipe-missing-saved-chapters-${video.videoId}`,
        label: `Recipe “${link.recipeTitle}” has no saved chapters but YouTube description includes them`,
        href: `/admin/recipes/${link.recipeId}`,
        kind: "recipe",
      });
    }
  }

  for (const recipe of recipesWithoutVideo) {
    issues.push({
      id: `recipe-no-video-${recipe.id}`,
      label: `Published recipe “${recipe.title}” has no YouTube video`,
      href: `/admin/recipes/${recipe.id}`,
      kind: "recipe",
    });
  }

  return issues;
}
