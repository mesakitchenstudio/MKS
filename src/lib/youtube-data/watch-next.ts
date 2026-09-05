import "server-only";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { readEditorialDishName } from "@/lib/recipe-editor-dish-name";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { youtubeThumbnailUrl, youtubeVideoId, youtubeWatchUrl } from "@/lib/youtube";
import { classifyYouTubeVideoFormat } from "@/lib/youtube-data/video-format";
import { recipeMainVideoId } from "@/lib/youtube-data/matching";
import type { RecipeYoutubeRelatedVideo } from "@/data/youtube-types";
import {
  pickWatchNextFromCandidates,
  type WatchNextCandidate,
  type WatchNextRecommendation,
} from "@/lib/youtube-data/watch-next-select";

export type { WatchNextRecommendation, WatchNextCandidate } from "@/lib/youtube-data/watch-next-select";
export {
  isWatchNextEligibleVideo,
  pickWatchNextFromCandidates,
  scoreWatchNextCandidate,
} from "@/lib/youtube-data/watch-next-select";

/**
 * Pick a Watch Next recommendation from Mesa's synced YouTube + published recipes.
 * No live YouTube API calls.
 */
export async function getWatchNextRecommendation(input: {
  currentVideoId: string;
  currentRecipeSlug: string;
  currentRecipeId?: string;
  currentCategories: string[];
  curatedRelated?: RecipeYoutubeRelatedVideo[];
}): Promise<WatchNextRecommendation | null> {
  if (input.currentRecipeId || input.currentRecipeSlug) {
    const { getSeriesWatchNextForRecipe } = await import("@/lib/series");
    const seriesNext = await getSeriesWatchNextForRecipe({
      recipeId: input.currentRecipeId,
      recipeSlug: input.currentRecipeSlug,
      currentVideoId: input.currentVideoId,
    });
    if (seriesNext) {
      return {
        videoId: seriesNext.videoId,
        title: seriesNext.title,
        thumbnailUrl: seriesNext.thumbnailUrl,
        durationDisplay: seriesNext.durationDisplay,
        watchUrl: seriesNext.watchUrl,
        recipeSlug: seriesNext.recipeSlug,
        recipeTitle: seriesNext.recipeTitle,
      };
    }
  }

  const currentVideoId = youtubeVideoId(input.currentVideoId) || input.currentVideoId;
  if (!currentVideoId) return null;

  const db = getDb();
  const curatedIds = new Set(
    (input.curatedRelated || [])
      .map((row) => youtubeVideoId(row.videoId || row.url) || "")
      .filter(Boolean),
  );

  const publishedRecipes = await db.recipe.findMany({
    where: { status: "published" },
    select: {
      slug: true,
      title: true,
      values: true,
      categories: { select: { category: { select: { slug: true } } } },
    },
  });

  const linkedByVideo = new Map<
    string,
    { recipeSlug: string; recipeTitle: string; categories: string[] }
  >();
  for (const row of publishedRecipes) {
    if (row.slug === input.currentRecipeSlug) continue;
    const values = parseValues(row.values);
    const videoId = recipeMainVideoId({
      youtubeUrl: typeof values.youtubeUrl === "string" ? values.youtubeUrl : undefined,
      youtube: parseRecipeYoutubeBlob(values.youtube),
    });
    if (!videoId || videoId === currentVideoId) continue;
    if (linkedByVideo.has(videoId)) continue;
    linkedByVideo.set(videoId, {
      recipeSlug: row.slug,
      recipeTitle: resolveRecipeCardTitle({
        title: row.title,
        dishName: readEditorialDishName(values),
      }),
      categories: row.categories.map((c) => c.category.slug),
    });
  }

  const channel = await db.youTubeChannel.findFirst({
    select: { channelId: true },
    orderBy: { lastSyncedAt: "desc" },
  });

  const videoIdSet = new Set<string>([...linkedByVideo.keys(), ...curatedIds]);

  const [linkedSynced, recentSynced] = await Promise.all([
    videoIdSet.size
      ? db.youTubeVideo.findMany({
          where: {
            videoId: { in: [...videoIdSet] },
            NOT: { videoId: currentVideoId },
          },
          select: {
            videoId: true,
            title: true,
            thumbnailUrl: true,
            durationDisplay: true,
            durationSeconds: true,
            publishedAt: true,
            privacyStatus: true,
            embeddable: true,
            tags: true,
            description: true,
          },
        })
      : Promise.resolve([]),
    channel
      ? db.youTubeVideo.findMany({
          where: {
            channelId: channel.channelId,
            NOT: { videoId: currentVideoId },
            embeddable: true,
          },
          orderBy: { publishedAt: "desc" },
          take: 40,
          select: {
            videoId: true,
            title: true,
            thumbnailUrl: true,
            durationDisplay: true,
            durationSeconds: true,
            publishedAt: true,
            privacyStatus: true,
            embeddable: true,
            tags: true,
            description: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const byId = new Map([...linkedSynced, ...recentSynced].map((row) => [row.videoId, row]));

  for (const related of input.curatedRelated || []) {
    const id = youtubeVideoId(related.videoId || related.url);
    if (!id || id === currentVideoId || byId.has(id)) continue;
    byId.set(id, {
      videoId: id,
      title: related.title || "Watch next",
      thumbnailUrl: related.thumbnailUrl || related.thumbnail || youtubeThumbnailUrl(id),
      durationDisplay: related.duration || "",
      durationSeconds: 0,
      publishedAt: null,
      privacyStatus: "public",
      embeddable: true,
      tags: "[]",
      description: "",
    });
  }

  const candidates: WatchNextCandidate[] = [];
  for (const row of byId.values()) {
    const link = linkedByVideo.get(row.videoId);
    const format = classifyYouTubeVideoFormat({
      title: row.title,
      description: row.description,
      tags: row.tags,
      durationSeconds: row.durationSeconds,
      url: youtubeWatchUrl(row.videoId) || undefined,
    });
    candidates.push({
      videoId: row.videoId,
      title: row.title || link?.recipeTitle || "Watch next",
      thumbnailUrl: row.thumbnailUrl || youtubeThumbnailUrl(row.videoId),
      durationDisplay: row.durationDisplay,
      durationSeconds: row.durationSeconds,
      publishedAt: row.publishedAt,
      privacyStatus: row.privacyStatus,
      embeddable: row.embeddable,
      format,
      recipeSlug: link?.recipeSlug,
      recipeTitle: link?.recipeTitle,
      recipeCategories: link?.categories || [],
      curated: curatedIds.has(row.videoId),
    });
  }

  return pickWatchNextFromCandidates(candidates, {
    currentVideoId,
    currentCategories: input.currentCategories,
  });
}
