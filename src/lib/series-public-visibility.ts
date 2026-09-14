/**
 * Shared public-renderability rules for SeriesItem membership.
 * Must stay aligned with mapSeriesItem filtering in series.ts.
 */

export type SeriesMembershipVisibilityInput = {
  removedFromPlaylist?: boolean;
  recipeId?: string | null;
  recipePublished?: boolean;
  youtubeVideoId?: string | null;
  /** YouTube privacyStatus; empty/missing treated as public. */
  videoPrivacy?: string | null;
};

/** True when the membership would appear on the public Collection page. */
export function isSeriesMembershipPubliclyRenderable(
  input: SeriesMembershipVisibilityInput,
): boolean {
  if (input.removedFromPlaylist) return false;
  const recipeOk = Boolean(input.recipeId && input.recipePublished);
  const videoId = (input.youtubeVideoId || "").trim();
  const privacy = (input.videoPrivacy || "").trim().toLowerCase();
  const videoOk = Boolean(videoId && (!privacy || privacy === "public"));
  return recipeOk || videoOk;
}

export type SeriesVisibilityCounts = {
  totalMembers: number;
  publicVisible: number;
  hidden: number;
};

export function countSeriesMembershipVisibility(
  items: SeriesMembershipVisibilityInput[],
): SeriesVisibilityCounts {
  const totalMembers = items.length;
  let publicVisible = 0;
  for (const item of items) {
    if (isSeriesMembershipPubliclyRenderable(item)) publicVisible += 1;
  }
  return {
    totalMembers,
    publicVisible,
    hidden: Math.max(0, totalMembers - publicVisible),
  };
}

/** Admin editor drafts → visibility input. */
export function adminSeriesItemToVisibilityInput(item: {
  removedFromPlaylist: boolean;
  recipeId: string;
  recipePublished: boolean;
  youtubeVideoId: string;
  videoPrivacy: string;
}): SeriesMembershipVisibilityInput {
  return {
    removedFromPlaylist: item.removedFromPlaylist,
    recipeId: item.recipeId || null,
    recipePublished: item.recipePublished,
    youtubeVideoId: item.youtubeVideoId || null,
    videoPrivacy: item.videoPrivacy,
  };
}
