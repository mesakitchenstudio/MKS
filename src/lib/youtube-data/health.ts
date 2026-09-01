import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";
import type {
  YouTubeContentHealthIssue,
  YouTubeVideoRowStatus,
  VideoContentHealthStatus,
  VideoRelationshipStatus,
} from "@/lib/youtube-data/types";
import {
  buildRecipeVideoIndex,
  recipeHasSavedChapters,
  titlesDifferSignificantly,
} from "@/lib/youtube-data/matching";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { parseRecipeAiMeta } from "@/lib/ai-recipe/types";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { classifyYouTubeVideoFormat } from "@/lib/youtube-data/video-format";
import type { YouTubeVideoFormat } from "@/lib/youtube-data/video-format";

export function videoRelationshipStatus(input: {
  linkedRecipeId?: string;
  possibleMatchRecipeId?: string;
}): VideoRelationshipStatus {
  if (input.linkedRecipeId) return "Linked";
  if (input.possibleMatchRecipeId) return "Possible match";
  return "Unlinked";
}

export function videoContentHealthStatus(input: {
  privacyStatus: string;
  embeddable: boolean;
  linkedRecipeId?: string;
  hasDescriptionChapters: boolean;
  hasRecipeChapters: boolean;
  format: YouTubeVideoFormat;
  hasMetadataIssue?: boolean;
}): VideoContentHealthStatus {
  if (input.privacyStatus && input.privacyStatus !== "public") return "Unavailable";
  if (!input.embeddable) return "Not embeddable";
  if (input.hasMetadataIssue) return "Metadata issue";
  if (input.format === "SHORT") return "—";
  if (!input.linkedRecipeId) return "—";

  const hasChapters = input.hasDescriptionChapters || input.hasRecipeChapters;

  if (input.format === "UNKNOWN") {
    return hasChapters ? "Chapters OK" : "—";
  }

  if (input.format === "LONG") {
    return hasChapters ? "Chapters OK" : "Missing chapters";
  }

  return "—";
}

/** @deprecated Prefer videoRelationshipStatus + videoContentHealthStatus in dashboard UI. */
export function videoRowStatus(input: {
  privacyStatus: string;
  embeddable: boolean;
  linkedRecipeId?: string;
  hasDescriptionChapters: boolean;
  hasRecipeChapters: boolean;
  format?: YouTubeVideoFormat;
}): YouTubeVideoRowStatus {
  if (input.privacyStatus && input.privacyStatus !== "public") return "Unavailable";
  if (!input.embeddable) return "Not embeddable";
  if (!input.linkedRecipeId) return "No recipe";
  if (input.format === "SHORT") return "Healthy";
  if (!input.hasDescriptionChapters && !input.hasRecipeChapters) return "Missing chapters";
  return "Healthy";
}

export type YouTubeContentHealthSummary = {
  videosNeedRecipes: number;
  recipesNeedVideos: number;
  metadataIssues: number;
  issues: YouTubeContentHealthIssue[];
};

/** True when a verified recipe's stored YouTube mirror differs from the synced cache. */
export function verifiedRecipeHasYoutubeMetadataDrift(input: {
  aiMetaRaw: string | null | undefined;
  recipeValuesRaw: string | Record<string, unknown> | null | undefined;
  video: {
    title: string;
    thumbnailUrl: string;
    durationDisplay: string;
    description: string;
  };
}): boolean {
  const aiMeta = parseRecipeAiMeta(input.aiMetaRaw);
  if (aiMeta?.verificationStatus !== "verified") return false;

  const values = parseValues(input.recipeValuesRaw);
  const blob = parseRecipeYoutubeBlob(values.youtube);
  if (!blob) return false;

  if (blob.title && titlesDifferSignificantly(input.video.title, blob.title)) return true;
  if (
    blob.duration &&
    input.video.durationDisplay &&
    blob.duration.trim() !== input.video.durationDisplay.trim()
  ) {
    return true;
  }
  if (
    blob.thumbnail &&
    input.video.thumbnailUrl &&
    blob.thumbnail.trim() !== input.video.thumbnailUrl.trim()
  ) {
    return true;
  }

  const descriptionChapters = parseYoutubeDescriptionChapters(input.video.description);
  const recipeChapterCount = blob.timestamps?.length ?? 0;
  if (descriptionChapters.length > 0 && recipeChapterCount > 0) {
    // Count mismatch only — do not rewrite chapters; report drift for editorial review.
    if (descriptionChapters.length !== recipeChapterCount) return true;
  }

  return false;
}

export async function summarizeYoutubeContentHealth(): Promise<YouTubeContentHealthSummary> {
  const issues = await buildYoutubeContentHealth();
  const videosNeedRecipes = issues.filter((issue) => issue.id.startsWith("video-no-recipe-")).length;
  const recipesNeedVideos = issues.filter((issue) => issue.id.startsWith("recipe-no-video-")).length;
  const metadataIssues = issues.length - videosNeedRecipes - recipesNeedVideos;
  return { videosNeedRecipes, recipesNeedVideos, metadataIssues, issues };
}

export async function buildYoutubeContentHealth(): Promise<YouTubeContentHealthIssue[]> {
  const db = getDb();
  const [{ byVideoId, recipes }, videos] = await Promise.all([
    buildRecipeVideoIndex({ includeDrafts: true }),
    db.youTubeVideo.findMany({ orderBy: { publishedAt: "desc" } }),
  ]);

  const publishedWithoutVideo = await buildRecipeVideoIndex({ includeDrafts: false }).then(
    (index) => index.recipesWithoutVideo,
  );

  const linkedRecipeIds = [...new Set([...byVideoId.values()].map((link) => link.recipeId))];
  const linkedRecipeMeta =
    linkedRecipeIds.length > 0
      ? await db.recipe.findMany({
          where: { id: { in: linkedRecipeIds } },
          select: { id: true, values: true, aiMeta: true },
        })
      : [];
  const metaById = new Map(linkedRecipeMeta.map((row) => [row.id, row]));

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
      const format = classifyYouTubeVideoFormat({
        title: video.title,
        description: video.description,
        tags: (() => {
          try {
            return JSON.parse(video.tags || "[]") as string[];
          } catch {
            return [];
          }
        })(),
        durationSeconds: video.durationSeconds,
      });
      if (format === "LONG") {
        issues.push({
          id: `video-no-chapters-${video.videoId}`,
          label: `“${video.title}” has no usable chapters`,
          href: `/admin/youtube/videos/${video.videoId}`,
          kind: "video",
        });
      }
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

    const stored = metaById.get(link.recipeId);
    if (
      stored &&
      verifiedRecipeHasYoutubeMetadataDrift({
        aiMetaRaw: stored.aiMeta,
        recipeValuesRaw: stored.values,
        video: {
          title: video.title,
          thumbnailUrl: video.thumbnailUrl,
          durationDisplay: video.durationDisplay,
          description: video.description,
        },
      })
    ) {
      issues.push({
        id: `verified-yt-drift-${video.videoId}`,
        label: `YouTube metadata has changed since verified recipe “${link.recipeTitle}” was last reviewed`,
        href: `/admin/recipes/${link.recipeId}`,
        kind: "recipe",
      });
    }
  }

  for (const recipe of publishedWithoutVideo) {
    issues.push({
      id: `recipe-no-video-${recipe.id}`,
      label: `Published recipe “${recipe.title}” has no YouTube video`,
      href: `/admin/recipes/${recipe.id}`,
      kind: "recipe",
    });
  }

  return issues;
}
