import { youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/youtube";
import type { YouTubeVideoFormat } from "@/lib/youtube-data/video-format";

export type WatchNextRecommendation = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  durationDisplay: string;
  watchUrl: string;
  recipeSlug?: string;
  recipeTitle?: string;
};

export type WatchNextCandidate = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  durationDisplay: string;
  durationSeconds: number;
  publishedAt: Date | null;
  privacyStatus: string;
  embeddable: boolean;
  format: YouTubeVideoFormat;
  recipeSlug?: string;
  recipeTitle?: string;
  recipeCategories: string[];
  curated: boolean;
};

/** Public + embeddable only — never recommend private/unlisted/non-embeddable. */
export function isWatchNextEligibleVideo(input: {
  privacyStatus?: string | null;
  embeddable?: boolean | null;
}): boolean {
  if (input.embeddable === false) return false;
  const privacy = String(input.privacyStatus || "public").trim().toLowerCase();
  return privacy === "" || privacy === "public";
}

/**
 * Higher score = better Watch Next pick.
 * Priority: shared category + LONG + linked recipe + curated > other LONG > newest.
 */
export function scoreWatchNextCandidate(
  candidate: WatchNextCandidate,
  currentCategories: string[],
): number {
  let score = 0;
  if (candidate.format === "LONG") score += 1_000;
  else if (candidate.format === "UNKNOWN") score += 200;

  const shared = candidate.recipeCategories.filter((c) => currentCategories.includes(c)).length;
  if (shared > 0) score += 500 + shared * 40;

  if (candidate.recipeSlug) score += 120;
  if (candidate.curated) score += 280;

  if (candidate.publishedAt) {
    score += Math.min(50, Math.floor(candidate.publishedAt.getTime() / 1e11));
  }
  return score;
}

export function pickWatchNextFromCandidates(
  candidates: WatchNextCandidate[],
  input: { currentVideoId: string; currentCategories: string[] },
): WatchNextRecommendation | null {
  const eligible = candidates.filter(
    (c) =>
      c.videoId &&
      c.videoId !== input.currentVideoId &&
      isWatchNextEligibleVideo(c),
  );
  if (!eligible.length) return null;

  eligible.sort((a, b) => {
    const scoreDiff =
      scoreWatchNextCandidate(b, input.currentCategories) -
      scoreWatchNextCandidate(a, input.currentCategories);
    if (scoreDiff !== 0) return scoreDiff;
    const at = a.publishedAt?.getTime() ?? 0;
    const bt = b.publishedAt?.getTime() ?? 0;
    return bt - at;
  });

  const best = eligible[0];
  if (!best) return null;
  return {
    videoId: best.videoId,
    title: best.title,
    thumbnailUrl: best.thumbnailUrl || youtubeThumbnailUrl(best.videoId),
    durationDisplay: best.durationDisplay,
    watchUrl: youtubeWatchUrl(best.videoId) || `https://www.youtube.com/watch?v=${best.videoId}`,
    recipeSlug: best.recipeSlug,
    recipeTitle: best.recipeTitle,
  };
}
