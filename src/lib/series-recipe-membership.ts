/**
 * Pure helpers for Recipe → Collection membership ordering (public discovery).
 * CUSTOM Mesa Collections before YOUTUBE; then sortOrder; then title.
 */

export const RECIPE_COLLECTION_MEMBERSHIP_CAP = 3;

export type RecipeCollectionMembershipSortable = {
  syncMode: string;
  sortOrder: number;
  title: string;
};

function syncModeRank(syncMode: string): number {
  return syncMode.trim().toUpperCase() === "YOUTUBE" ? 1 : 0;
}

/** Deterministic: CUSTOM before YOUTUBE → sortOrder asc → title asc. */
export function compareRecipeCollectionMembership(
  a: RecipeCollectionMembershipSortable,
  b: RecipeCollectionMembershipSortable,
): number {
  const byMode = syncModeRank(a.syncMode) - syncModeRank(b.syncMode);
  if (byMode !== 0) return byMode;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.title.localeCompare(b.title, "en");
}

export function selectRecipeCollectionMemberships<T extends RecipeCollectionMembershipSortable>(
  candidates: T[],
  limit = RECIPE_COLLECTION_MEMBERSHIP_CAP,
): T[] {
  return [...candidates].sort(compareRecipeCollectionMembership).slice(0, Math.max(0, limit));
}
