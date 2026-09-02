import {
  isFullPublicVideo,
  isPublicFeaturedEligible,
  isShortPublicVideo,
  PUBLIC_SHORTS_FILTER_MIN,
  toPublicVideoCard,
} from "@/lib/public-videos/eligibility";
import type {
  PublicVideoCard,
  PublicVideoCatalogue,
  PublicVideoSourceRow,
} from "@/lib/public-videos/types";

function publishedMs(card: PublicVideoCard): number {
  if (!card.publishedAt) return 0;
  const ms = Date.parse(card.publishedAt);
  return Number.isFinite(ms) ? ms : 0;
}

function sortNewestFirst(a: PublicVideoCard, b: PublicVideoCard): number {
  const diff = publishedMs(b) - publishedMs(a);
  if (diff !== 0) return diff;
  return a.videoId.localeCompare(b.videoId);
}

/**
 * Pick the featured video: newest eligible Long.
 * Prefer embeddable when choosing among equals; skip ineligible rows.
 */
export function selectFeaturedPublicVideo(videos: PublicVideoCard[]): PublicVideoCard | null {
  const longCandidates = videos
    .filter((video) =>
      isPublicFeaturedEligible({
        videoId: video.videoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        privacyStatus: "public",
        format: video.format,
        embeddable: video.embeddable,
      }),
    )
    .sort((a, b) => {
      const byDate = sortNewestFirst(a, b);
      if (byDate !== 0) return byDate;
      if (a.embeddable !== b.embeddable) return a.embeddable ? -1 : 1;
      return 0;
    });

  // Prefer newest embeddable Long; if none embeddable, still feature newest Long.
  const embeddable = longCandidates.find((video) => video.embeddable);
  return embeddable ?? longCandidates[0] ?? null;
}

/**
 * Build the public catalogue view-model from synced source rows.
 * Featured video is excluded from the main grid by videoId.
 */
export function buildPublicVideoCatalogue(
  rows: PublicVideoSourceRow[],
  options?: { shortsFilterMin?: number },
): PublicVideoCatalogue {
  const cards = rows
    .map((row) => toPublicVideoCard(row))
    .filter((card): card is PublicVideoCard => Boolean(card))
    .sort(sortNewestFirst);

  const featured = selectFeaturedPublicVideo(cards);
  const featuredId = featured?.videoId ?? null;

  const remaining = featuredId
    ? cards.filter((card) => card.videoId !== featuredId)
    : cards;

  const videos = remaining.filter((card) => isFullPublicVideo(card.format));
  const shorts = remaining.filter((card) => isShortPublicVideo(card.format));

  // Counts include featured for filter UX decisions.
  const allFull = cards.filter((card) => isFullPublicVideo(card.format));
  const allShorts = cards.filter((card) => isShortPublicVideo(card.format));
  const shortsFilterMin = options?.shortsFilterMin ?? PUBLIC_SHORTS_FILTER_MIN;

  return {
    featured,
    videos,
    shorts,
    longCount: allFull.length,
    shortCount: allShorts.length,
    showFormatFilter: allShorts.length >= shortsFilterMin,
    ok: true,
  };
}

/** Ensure featured ID never appears in a grid list. */
export function excludeFeaturedFromGrid(
  videos: PublicVideoCard[],
  featuredVideoId: string | null | undefined,
): PublicVideoCard[] {
  if (!featuredVideoId) return videos;
  return videos.filter((video) => video.videoId !== featuredVideoId);
}
