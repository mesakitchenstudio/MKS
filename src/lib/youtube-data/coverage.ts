/**
 * Mesa YouTube catalog coverage — operational denominators use synced DB rows only.
 */

export type VideoCoverageStats = {
  /** Public synced videos with a Mesa recipe link. */
  linkedCount: number;
  /** All public synced YouTubeVideo rows in Mesa DB. */
  syncedPublicVideoCount: number;
  /** Parsed YouTubeChannel.videoCount from latest Data API sync. */
  channelVideoCount: number | null;
  percentage: number;
  /** True when channel counter and synced public inventory disagree. */
  inventoryMismatch: boolean;
};

export type RecipeCoverageStats = {
  /** Published recipes with a linked YouTube video. */
  withVideoCount: number;
  /** All published recipes (drafts excluded). */
  publishedRecipeCount: number;
  percentage: number;
};

export function computeVideoCoverage(input: {
  linkedPublicVideoCount: number;
  syncedPublicVideoCount: number;
  channelVideoCount: number | null;
}): VideoCoverageStats {
  const { linkedPublicVideoCount, syncedPublicVideoCount, channelVideoCount } = input;
  const percentage =
    syncedPublicVideoCount > 0
      ? Math.round((linkedPublicVideoCount / syncedPublicVideoCount) * 100)
      : 0;
  const inventoryMismatch =
    channelVideoCount !== null &&
    syncedPublicVideoCount > 0 &&
    channelVideoCount !== syncedPublicVideoCount;

  return {
    linkedCount: linkedPublicVideoCount,
    syncedPublicVideoCount,
    channelVideoCount,
    percentage,
    inventoryMismatch,
  };
}

export function computeRecipeCoverage(input: {
  publishedWithVideoCount: number;
  publishedRecipeCount: number;
}): RecipeCoverageStats {
  const { publishedWithVideoCount, publishedRecipeCount } = input;
  const percentage =
    publishedRecipeCount > 0
      ? Math.round((publishedWithVideoCount / publishedRecipeCount) * 100)
      : 0;

  return {
    withVideoCount: publishedWithVideoCount,
    publishedRecipeCount,
    percentage,
  };
}

export function parseChannelVideoCount(raw: string | null | undefined): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const value = Number(BigInt(trimmed));
    return Number.isFinite(value) ? value : null;
  } catch {
    const parsed = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
}
