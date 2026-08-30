import type { Recipe } from "@/data/types";
import type {
  RecipeYoutube,
  RecipeYoutubeRelatedVideo,
  RecipeYoutubeTimestamp,
  ResolvedRecipeYoutube,
} from "@/data/youtube-types";
import {
  youtubeThumbnailUrl,
  youtubeVideoId,
  youtubeWatchUrl,
  youtubeWatchUrlAt,
} from "@/lib/youtube";
import { parseTimestampInput, formatTimestampInput } from "@/lib/youtube-metadata-editor";
import {
  fetchYoutubeVideoDescriptionMeta,
  parseYoutubeDescriptionChapters,
} from "@/lib/youtube-description";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

function parseTimestamps(value: unknown): RecipeYoutubeTimestamp[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item as {
        label?: string;
        time?: unknown;
        seconds?: unknown;
        stepIndex?: unknown;
        instructionIndex?: unknown;
      };
      const time =
        asNumber(row.time) ??
        asNumber(row.seconds) ??
        (typeof row.time === "string" ? parseTimestampInput(row.time) : null) ??
        (typeof row.seconds === "string" ? parseTimestampInput(row.seconds) : null);
      if (!row.label || time == null || time < 0) return null;
      const stepIndex = asNumber(row.stepIndex) ?? asNumber(row.instructionIndex);
      return {
        label: String(row.label),
        time,
        ...(stepIndex != null ? { stepIndex } : {}),
      };
    })
    .filter((item): item is RecipeYoutubeTimestamp => item !== null);
}

function parseRelatedVideos(value: unknown): RecipeYoutubeRelatedVideo[] {
  if (!Array.isArray(value)) return [];
  const results: RecipeYoutubeRelatedVideo[] = [];
  for (const item of value) {
    const row = item as Partial<RecipeYoutubeRelatedVideo> & {
      videoId?: string;
      thumbnailUrl?: string;
      category?: string;
    };
    const videoId = row.videoId || (row.url ? youtubeVideoId(row.url) : null);
    if (!row.title || !videoId) continue;
    const url = row.url || youtubeWatchUrl(videoId) || "";
    results.push({
      title: row.title,
      videoId,
      url,
      thumbnail: row.thumbnail || row.thumbnailUrl || youtubeThumbnailUrl(videoId),
      duration: row.duration,
      label: row.label || row.category,
    });
  }
  return results;
}

/** Parse nested `youtube` object from recipe values JSON. */
export function parseRecipeYoutubeBlob(value: unknown): RecipeYoutube | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const videoId =
    asString(row.videoId) ||
    (asString(row.url) ? youtubeVideoId(asString(row.url)) : null) ||
    undefined;
  if (!videoId && !asString(row.url)) {
    const timestamps = parseTimestamps(row.timestamps);
    const relatedVideos = parseRelatedVideos(row.relatedVideos);
    if (!timestamps.length && !relatedVideos.length && !asString(row.hook)) return null;
  }

  return {
    videoId,
    title: asString(row.title) || undefined,
    duration: asString(row.duration) || undefined,
    thumbnail: asString(row.thumbnail) || undefined,
    url: asString(row.url) || undefined,
    hook: asString(row.hook) || asString(row.sectionDescription) || undefined,
    videoCtaDescription:
      asString(row.videoCtaDescription) || asString(row.ctaDescription) || undefined,
    playlistUrl: asString(row.playlistUrl) || undefined,
    playlistLabel: asString(row.playlistLabel) || undefined,
    timestamps: parseTimestamps(row.timestamps),
    relatedVideos: parseRelatedVideos(row.relatedVideos ?? row.relatedYoutubeVideos),
  };
}

/** Merge legacy flat URLs with optional rich `youtube` metadata. */
export function resolveRecipeYoutube(recipe: Pick<Recipe, "slug" | "title" | "youtubeUrl" | "youtube">): ResolvedRecipeYoutube | null {
  const blob = recipe.youtube;
  const legacyUrl = recipe.youtubeUrl?.trim() || "";
  const url =
    blob?.url?.trim() ||
    legacyUrl ||
    (blob?.videoId ? youtubeWatchUrl(blob.videoId) : null) ||
    "";
  const videoId = blob?.videoId || youtubeVideoId(url);
  if (!videoId) return null;

  const watchUrl = youtubeWatchUrl(videoId) || url;
  const title = blob?.title?.trim() || `How to Make ${recipe.title}`;
  const hook =
    blob?.hook?.trim() ||
    blob?.sectionDescription?.trim() ||
    `See exactly how we make ${recipe.title.toLowerCase()} in the studio — the same step-by-step flow we use when testing this recipe.`;
  const videoCtaDescription =
    blob?.videoCtaDescription?.trim() ||
    blob?.ctaDescription?.trim() ||
    "See the key techniques and final results in the step-by-step video.";

  return {
    videoId,
    url: watchUrl,
    watchUrl,
    title,
    hook,
    videoCtaDescription,
    duration: blob?.duration,
    thumbnail: blob?.thumbnail || youtubeThumbnailUrl(videoId),
    playlistUrl: blob?.playlistUrl,
    playlistLabel: blob?.playlistLabel,
    timestamps: blob?.timestamps ?? [],
    relatedVideos: blob?.relatedVideos ?? [],
  };
}

/** Fill missing chapter timestamps from the YouTube description (pure helper for tests). */
export function applyDescriptionChaptersToResolvedYoutube(
  youtube: ResolvedRecipeYoutube,
  description: string,
  durationSeconds?: number | null,
): ResolvedRecipeYoutube {
  if (youtube.timestamps.length > 0) return youtube;

  const chapters = parseYoutubeDescriptionChapters(description);
  if (!chapters.length) return youtube;

  const duration =
    youtube.duration ||
    (durationSeconds != null && durationSeconds > 0
      ? formatTimestampInput(durationSeconds)
      : undefined);

  return {
    ...youtube,
    duration,
    timestamps: chapters.map((chapter) => ({
      time: chapter.time,
      label: chapter.label,
    })),
  };
}

/** Resolve recipe YouTube metadata, importing description chapters when the DB has none. */
export async function resolveRecipeYoutubeForDisplay(
  recipe: Pick<Recipe, "slug" | "title" | "youtubeUrl" | "youtube">,
): Promise<ResolvedRecipeYoutube | null> {
  const base = resolveRecipeYoutube(recipe);
  if (!base || base.timestamps.length > 0) return base;

  try {
    const meta = await fetchYoutubeVideoDescriptionMeta(base.videoId);
    if (!meta?.description.trim()) return base;
    return applyDescriptionChaptersToResolvedYoutube(
      base,
      meta.description,
      meta.durationSeconds,
    );
  } catch {
    return base;
  }
}

export function hasRecipeYoutube(recipe: Pick<Recipe, "youtubeUrl" | "youtube">) {
  const blob = recipe.youtube;
  const legacyUrl = recipe.youtubeUrl?.trim() || "";
  const url =
    blob?.url?.trim() ||
    legacyUrl ||
    (blob?.videoId ? youtubeWatchUrl(blob.videoId) : null) ||
    "";
  const videoId = blob?.videoId || youtubeVideoId(url);
  return Boolean(videoId);
}

export function timestampForStep(
  timestamps: RecipeYoutubeTimestamp[] | undefined,
  stepIndex: number,
) {
  return timestamps?.find((item) => item.stepIndex === stepIndex);
}

/** Exclude placeholder/dev IDs from structured data. */
export function isSchemaVideoId(urlOrId: string) {
  const id = youtubeVideoId(urlOrId) || urlOrId;
  if (!id || id.length !== 11) return false;
  if (/placeholder/i.test(id)) return false;
  if (/^RELATEDVID/i.test(id)) return false;
  return true;
}
