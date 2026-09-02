import "server-only";

import { getDb } from "@/lib/db";
import { buildRecipeVideoIndex } from "@/lib/youtube-data/matching";
import { youtubeWatchUrl } from "@/lib/youtube";
import { buildPublicVideoCatalogue } from "@/lib/public-videos/catalogue";
import { isPublicCatalogueEligible, toPublicVideoCard } from "@/lib/public-videos/eligibility";
import type {
  PublicVideoCatalogueResult,
  PublicVideoSourceRow,
  PublicVideoWatch,
} from "@/lib/public-videos/types";

const PUBLIC_VIDEO_SELECT = {
  videoId: true,
  title: true,
  thumbnailUrl: true,
  durationDisplay: true,
  durationSeconds: true,
  publishedAt: true,
  privacyStatus: true,
  embeddable: true,
  description: true,
  tags: true,
} as const;

async function loadPublicVideoSourceRows(): Promise<PublicVideoSourceRow[]> {
  const db = getDb();
  const [videos, recipeIndex] = await Promise.all([
    db.youTubeVideo.findMany({
      select: PUBLIC_VIDEO_SELECT,
      orderBy: [{ publishedAt: "desc" }, { videoId: "asc" }],
    }),
    buildRecipeVideoIndex({ includeDrafts: false }),
  ]);

  return videos.map((video) => {
    const link = recipeIndex.byVideoId.get(video.videoId);
    return {
      videoId: video.videoId,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      durationDisplay: video.durationDisplay,
      durationSeconds: video.durationSeconds,
      publishedAt: video.publishedAt,
      privacyStatus: video.privacyStatus,
      embeddable: video.embeddable,
      description: video.description,
      tags: video.tags,
      recipeSlug: link?.recipeSlug,
      recipeTitle: link?.recipeTitle,
    };
  });
}

/**
 * Load the public /videos catalogue from synced YouTubeVideo rows.
 * No live YouTube API calls.
 */
export async function loadPublicVideoCatalogue(): Promise<PublicVideoCatalogueResult> {
  try {
    const rows = await loadPublicVideoSourceRows();
    return buildPublicVideoCatalogue(rows);
  } catch {
    return { ok: false, error: "load_failed" };
  }
}

/**
 * Resolve a single public watch page from the synced catalogue.
 * Returns null when missing or not publicly eligible.
 */
export async function loadPublicVideoWatch(videoId: string): Promise<PublicVideoWatch | null> {
  const id = String(videoId ?? "").trim();
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) return null;

  try {
    const db = getDb();
    const [video, recipeIndex] = await Promise.all([
      db.youTubeVideo.findUnique({
        where: { videoId: id },
        select: PUBLIC_VIDEO_SELECT,
      }),
      buildRecipeVideoIndex({ includeDrafts: false }),
    ]);
    if (!video) return null;

    const link = recipeIndex.byVideoId.get(video.videoId);
    const row: PublicVideoSourceRow = {
      videoId: video.videoId,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      durationDisplay: video.durationDisplay,
      durationSeconds: video.durationSeconds,
      publishedAt: video.publishedAt,
      privacyStatus: video.privacyStatus,
      embeddable: video.embeddable,
      description: video.description,
      tags: video.tags,
      recipeSlug: link?.recipeSlug,
      recipeTitle: link?.recipeTitle,
    };

    if (!isPublicCatalogueEligible(row)) return null;
    const card = toPublicVideoCard(row);
    if (!card) return null;

    return {
      ...card,
      youtubeWatchUrl:
        youtubeWatchUrl(card.videoId) || `https://www.youtube.com/watch?v=${card.videoId}`,
    };
  } catch {
    return null;
  }
}
