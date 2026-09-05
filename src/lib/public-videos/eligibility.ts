import { youtubeThumbnailUrl } from "@/lib/youtube";
import {
  classifyYouTubeVideoFormat,
  type YouTubeVideoFormat,
} from "@/lib/youtube-data/video-format";
import type { PublicVideoCard, PublicVideoSourceRow } from "@/lib/public-videos/types";

/** Minimum Shorts count before showing a Full videos | Shorts control. */
export const PUBLIC_SHORTS_FILTER_MIN = 4;

export function isPublicPrivacyStatus(privacyStatus?: string | null): boolean {
  const privacy = String(privacyStatus ?? "public").trim().toLowerCase();
  return privacy === "" || privacy === "public";
}

export function hasUsablePublicThumbnail(input: {
  videoId?: string | null;
  thumbnailUrl?: string | null;
}): boolean {
  const direct = String(input.thumbnailUrl ?? "").trim();
  if (direct.startsWith("http://") || direct.startsWith("https://") || direct.startsWith("/")) {
    return true;
  }
  const id = String(input.videoId ?? "").trim();
  return Boolean(id && /^[a-zA-Z0-9_-]{11}$/.test(id));
}

/**
 * Catalogue eligibility for the public /videos experience.
 * Admin health (chapters, recipe link, metadata) must not hide content.
 */
export function isPublicCatalogueEligible(input: {
  videoId?: string | null;
  title?: string | null;
  thumbnailUrl?: string | null;
  privacyStatus?: string | null;
  hiddenFromSite?: boolean | null;
}): boolean {
  if (input.hiddenFromSite === true) return false;
  if (!isPublicPrivacyStatus(input.privacyStatus)) return false;
  const title = String(input.title ?? "").trim();
  if (!title) return false;
  const videoId = String(input.videoId ?? "").trim();
  if (!videoId) return false;
  return hasUsablePublicThumbnail({ videoId, thumbnailUrl: input.thumbnailUrl });
}

/** Featured prefers Long + preferably embeddable; never Short. */
export function isPublicFeaturedEligible(input: {
  videoId?: string | null;
  title?: string | null;
  thumbnailUrl?: string | null;
  privacyStatus?: string | null;
  hiddenFromSite?: boolean | null;
  format: YouTubeVideoFormat;
  embeddable?: boolean | null;
}): boolean {
  if (!isPublicCatalogueEligible(input)) return false;
  if (input.format !== "LONG") return false;
  return true;
}

export function resolvePublicThumbnailUrl(videoId: string, thumbnailUrl?: string | null): string {
  const direct = String(thumbnailUrl ?? "").trim();
  if (direct.startsWith("http://") || direct.startsWith("https://") || direct.startsWith("/")) {
    return direct;
  }
  return youtubeThumbnailUrl(videoId, "hq");
}

export function toPublicVideoCard(row: PublicVideoSourceRow): PublicVideoCard | null {
  if (!isPublicCatalogueEligible(row)) return null;
  const format = classifyYouTubeVideoFormat({
    title: row.title,
    description: row.description,
    tags: row.tags,
    durationSeconds: row.durationSeconds,
  });
  const durationDisplay =
    String(row.durationDisplay ?? "").trim() ||
    (row.durationSeconds > 0
      ? `${Math.floor(row.durationSeconds / 60)}:${String(row.durationSeconds % 60).padStart(2, "0")}`
      : "");

  return {
    videoId: row.videoId,
    title: String(row.title).trim(),
    thumbnailUrl: resolvePublicThumbnailUrl(row.videoId, row.thumbnailUrl),
    durationDisplay,
    durationSeconds: Math.max(0, Math.floor(row.durationSeconds || 0)),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    embeddable: row.embeddable !== false,
    format,
    recipeSlug: row.recipeSlug,
    recipeTitle: row.recipeTitle,
  };
}

/**
 * Full-videos grid: LONG only.
 * UNKNOWN is deliberately excluded (not treated as full-length).
 */
export function isFullPublicVideo(format: YouTubeVideoFormat): boolean {
  return format === "LONG";
}

export function isShortPublicVideo(format: YouTubeVideoFormat): boolean {
  return format === "SHORT";
}
