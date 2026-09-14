/**
 * Deterministic Category → Collection relevance (no AI, no schema).
 * Reuses taxonomyKey from recipe-hero-series for category-clone suppression.
 */

import { taxonomyKey } from "@/lib/recipe-hero-series";

export const CATEGORY_COLLECTION_SHELF_CAP = 3;
export const CATEGORY_COLLECTION_MIN_SHARED = 2;
export const CATEGORY_COLLECTION_SHARE_THRESHOLD = 0.4;

export type CategoryCollectionScoringCandidate = {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  syncMode: string;
  /** Publicly visible Collection recipes that also belong to the category. */
  sharedCount: number;
  /** Total publicly visible recipe members in the Collection. */
  collectionPublicRecipeCount: number;
};

export type CategoryCollectionScoreResult = {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  syncMode: string;
  sharedCount: number;
  share: number;
  score: number;
};

function syncModeRank(syncMode: string): number {
  return syncMode.trim().toUpperCase() === "YOUTUBE" ? 1 : 0;
}

/** True when Collection title/slug merely restates the Category. */
export function isCategoryCloneCollection(
  collection: { title: string; slug: string },
  category: { name: string; slug: string },
): boolean {
  const categoryKeys = [
    taxonomyKey(category.name),
    taxonomyKey(category.slug.replace(/-/g, " ")),
  ].filter(Boolean);
  const collectionKeys = [
    taxonomyKey(collection.title),
    taxonomyKey(collection.slug.replace(/-/g, " ")),
  ].filter(Boolean);
  if (!categoryKeys.length || !collectionKeys.length) return false;
  return collectionKeys.some((key) => categoryKeys.includes(key));
}

export function scoreCategoryCollectionCandidate(
  candidate: CategoryCollectionScoringCandidate,
  category: { name: string; slug: string },
): CategoryCollectionScoreResult | null {
  if (candidate.collectionPublicRecipeCount <= 0) return null;
  if (candidate.sharedCount <= 0) return null;
  if (isCategoryCloneCollection(candidate, category)) return null;

  const share = candidate.sharedCount / candidate.collectionPublicRecipeCount;
  const qualifiesByCount = candidate.sharedCount >= CATEGORY_COLLECTION_MIN_SHARED;
  const qualifiesByShare =
    candidate.sharedCount >= 1 && share >= CATEGORY_COLLECTION_SHARE_THRESHOLD;
  if (!qualifiesByCount && !qualifiesByShare) return null;

  // Prefer stronger overlap; share breaks near-ties without dominating raw counts.
  const score = candidate.sharedCount * 10 + Math.round(share * 10);

  return {
    id: candidate.id,
    slug: candidate.slug,
    title: candidate.title,
    sortOrder: candidate.sortOrder,
    syncMode: candidate.syncMode,
    sharedCount: candidate.sharedCount,
    share,
    score,
  };
}

/**
 * Rank category Collections. Cap 3. Tie-break:
 * score desc → sharedCount desc → share desc → CUSTOM before YOUTUBE → sortOrder → title.
 */
export function selectCategoryCollections(
  candidates: CategoryCollectionScoringCandidate[],
  category: { name: string; slug: string },
  limit = CATEGORY_COLLECTION_SHELF_CAP,
): CategoryCollectionScoreResult[] {
  const seen = new Set<string>();
  const scored: CategoryCollectionScoreResult[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const result = scoreCategoryCollectionCandidate(candidate, category);
    if (result) scored.push(result);
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
    if (b.share !== a.share) return b.share - a.share;
    const byMode = syncModeRank(a.syncMode) - syncModeRank(b.syncMode);
    if (byMode !== 0) return byMode;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, "en");
  });

  return scored.slice(0, Math.max(0, limit));
}
