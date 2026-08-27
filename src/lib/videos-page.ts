import type { Recipe } from "@/data/types";
import type { VideoItem, VideoPageSectionConfig } from "@/data/videos";
import { VIDEO_PAGE_SECTIONS, videoItemsByIds } from "@/data/videos";
import { toDisplayTitle } from "@/lib/display-title";
import { isSchemaVideoId, resolveRecipeYoutube } from "@/lib/recipe-youtube";
import { youtubeWatchUrl } from "@/lib/youtube";

export type ResolvedVideoItem = {
  id: string;
  title: string;
  category: string;
  thumbnail?: string;
  thumbnailAlt: string;
  watchUrl?: string;
  videoId?: string;
  recipeSlug?: string;
  recipeTitle?: string;
  duration?: string;
};

export type ResolvedVideoSection = {
  id: string;
  title: string;
  videos: ResolvedVideoItem[];
};

function recipeMap(recipes: Recipe[]) {
  return new Map(recipes.map((recipe) => [recipe.slug, recipe]));
}

function resolveWatchUrl(item: VideoItem, recipe?: Recipe) {
  const youtube = recipe ? resolveRecipeYoutube(recipe) : null;
  const candidateId = item.youtubeId || youtube?.videoId;
  if (candidateId && isSchemaVideoId(candidateId)) {
    return item.youtubeUrl || youtube?.watchUrl || youtubeWatchUrl(candidateId) || undefined;
  }
  const candidateUrl = item.youtubeUrl || youtube?.url;
  if (candidateUrl && isSchemaVideoId(candidateUrl)) {
    return candidateUrl;
  }
  return undefined;
}

function resolveDuration(item: VideoItem, recipe?: Recipe, watchUrl?: string) {
  if (!watchUrl) return undefined;
  const youtube = recipe ? resolveRecipeYoutube(recipe) : null;
  const duration = item.duration || youtube?.duration;
  if (!duration || duration === "—") return undefined;
  return duration;
}

export function resolveVideoItem(item: VideoItem, recipes: Recipe[]): ResolvedVideoItem {
  const map = recipeMap(recipes);
  const recipe = item.recipeSlug ? map.get(item.recipeSlug) : undefined;
  const youtube = recipe ? resolveRecipeYoutube(recipe) : null;
  const watchUrl = resolveWatchUrl(item, recipe);
  const videoId =
    watchUrl && youtube?.videoId && isSchemaVideoId(youtube.videoId)
      ? youtube.videoId
      : watchUrl && item.youtubeId && isSchemaVideoId(item.youtubeId)
        ? item.youtubeId
        : undefined;

  const thumbnail =
    item.thumbnail || (item.recipeSlug && recipe?.image) || (videoId ? youtube?.thumbnail : undefined);
  const thumbnailAlt = recipe?.imageAlt || item.title;
  const rawTitle = watchUrl && youtube?.title ? youtube.title : item.title;
  const title = toDisplayTitle(rawTitle);

  return {
    id: item.id,
    title,
    category: item.category,
    thumbnail,
    thumbnailAlt,
    watchUrl,
    videoId,
    recipeSlug: item.recipeSlug,
    recipeTitle: recipe?.title,
    duration: resolveDuration(item, recipe, watchUrl),
  };
}

export function resolveVideoPageSections(
  recipes: Recipe[],
  sections: VideoPageSectionConfig[] = VIDEO_PAGE_SECTIONS,
): ResolvedVideoSection[] {
  return sections
    .map((section) => ({
      id: section.id,
      title: section.title,
      videos: videoItemsByIds(section.videoIds).map((item) => resolveVideoItem(item, recipes)),
    }))
    .filter((section) => section.videos.length > 0);
}
