/**
 * Mesa YouTube catalog coverage — operational denominators use synced DB rows only.
 */

export type VideoLinkScopeBreakdown = {
  /** Links where the Mesa recipe is published. */
  publishedLinks: number;
  /** Links where the Mesa recipe is draft (or non-published). */
  draftLinks: number;
};

export type VideoCoverageStats = {
  /** Public synced videos linked to any Mesa recipe (draft or published). */
  linkedCount: number;
  /** All public synced YouTubeVideo rows in Mesa DB. */
  syncedPublicVideoCount: number;
  /** Parsed YouTubeChannel.videoCount from latest Data API sync. */
  channelVideoCount: number | null;
  percentage: number;
  /** True when channel counter and synced public inventory disagree. */
  inventoryMismatch: boolean;
  /** Published vs draft recipe links among linked public videos. */
  linkScope?: VideoLinkScopeBreakdown;
};

export type RecipeCoverageStats = {
  /** Published recipes with a linked YouTube video. */
  withVideoCount: number;
  /** All published recipes (drafts excluded). */
  publishedRecipeCount: number;
  percentage: number;
};

export function computeVideoLinkScopeBreakdown(input: {
  linkedPublicVideoIds: string[];
  recipeStatusById: Map<string, string>;
  linkRecipeIdByVideoId: Map<string, string>;
}): VideoLinkScopeBreakdown {
  let publishedLinks = 0;
  let draftLinks = 0;

  for (const videoId of input.linkedPublicVideoIds) {
    const recipeId = input.linkRecipeIdByVideoId.get(videoId);
    if (!recipeId) continue;
    const status = input.recipeStatusById.get(recipeId);
    if (status === "published") publishedLinks += 1;
    else draftLinks += 1;
  }

  return { publishedLinks, draftLinks };
}

export function formatVideoLinkScopeBreakdown(breakdown: VideoLinkScopeBreakdown): string | null {
  const total = breakdown.publishedLinks + breakdown.draftLinks;
  if (total <= 0) return null;
  if (breakdown.draftLinks <= 0) {
    return `${breakdown.publishedLinks} published link${breakdown.publishedLinks === 1 ? "" : "s"}`;
  }
  if (breakdown.publishedLinks <= 0) {
    return `${breakdown.draftLinks} draft link${breakdown.draftLinks === 1 ? "" : "s"}`;
  }
  return `${total} links total · ${breakdown.publishedLinks} published · ${breakdown.draftLinks} draft`;
}

export function computeVideoCoverage(input: {
  linkedPublicVideoCount: number;
  syncedPublicVideoCount: number;
  channelVideoCount: number | null;
  linkScope?: VideoLinkScopeBreakdown;
}): VideoCoverageStats {
  const { linkedPublicVideoCount, syncedPublicVideoCount, channelVideoCount, linkScope } = input;
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
    linkScope,
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
