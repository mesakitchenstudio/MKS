/**
 * Phase 7B — Personalized Member Home domain (pure types + ranking).
 *
 * Recommendations use server-owned Published RecipeSave affinities only.
 * Recently Viewed is intentionally excluded from scoring (browser-local; Phase 7D UI).
 * Profile/Home reads must never create a Meal Plan.
 */

import type { Recipe } from "@/data/types";
import { scoreRelatedRecipe } from "@/lib/recipe-related";
import {
  PRIMARY_CATEGORY_LABELS,
  type PrimaryCategorySlug,
} from "@/lib/recipe-primary-taxonomy";
import type { MealSlot } from "@/lib/meal-planner";
import { isPersonalizedMemberHomeEnabled } from "@/lib/flags";

export { isPersonalizedMemberHomeEnabled };

/** Presentation-safe meal row for Home (never includes planner notes). */
export type MemberHomeMealItemInput = {
  id: string;
  recipeId: string | null;
  recipeTitle: string;
  planDate: string;
  mealSlot: MealSlot;
  plannedServings: number;
  recipeAvailability: "available" | "unavailable" | "orphaned";
  publicRecipeSlug: string | null;
  note?: string | null;
};

/** Saved Recipe cards shown on Home before “View all”. */
export const MEMBER_HOME_SAVED_PREVIEW_MAX = 6;
/** Collections listed on Home. */
export const MEMBER_HOME_COLLECTION_PREVIEW_MAX = 3;
/** Next meals from the selected plan/week. */
export const MEMBER_HOME_PLANNER_NEXT_MEALS_MAX = 3;
/** Discover / Latest fallback cards. */
export const MEMBER_HOME_DISCOVER_MAX = 4;
/** Max recommendation cards. */
export const MEMBER_HOME_RECOMMENDATION_MAX = 4;
/** Require at least this many Published saves before ranking. */
export const MEMBER_HOME_RECOMMENDATION_MIN_SAVES = 2;
/** Require at least this many scored survivors after thresholds. */
export const MEMBER_HOME_RECOMMENDATION_MIN_RESULTS = 3;
/** Minimum absolute score to keep a candidate. */
export const MEMBER_HOME_RECOMMENDATION_MIN_SCORE = 40;
/** Soft cap: at most this many recommendations share one primary category. */
export const MEMBER_HOME_RECOMMENDATION_MAX_PER_PRIMARY_CATEGORY = 2;

/** Explicit affinity weights (must stay explainable and deterministic). */
export const MEMBER_HOME_SCORE_PRIMARY_CATEGORY = 40;
export const MEMBER_HOME_SCORE_COURSE = 30;
export const MEMBER_HOME_SCORE_CUISINE = 25;
export const MEMBER_HOME_SCORE_TYPE = 20;
export const MEMBER_HOME_SCORE_METHOD = 15;

/**
 * Related-recipe helper scores can reach hundreds (course/type/tags).
 * Scale + hard-cap so related contribution cannot dominate affinity weights.
 */
export const MEMBER_HOME_RELATED_SCORE_SCALE = 0.2;
export const MEMBER_HOME_RELATED_SCORE_CAP = 50;
/** Related score must clear this before “Because you saved {Recipe}” attribution. */
export const MEMBER_HOME_BECAUSE_SAVED_RELATED_MIN = 70;

export type MemberHomeSectionStatus = "ok" | "empty" | "unavailable";

export type MemberHomeRecipeCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  imageAlt: string;
  categories: string[];
  cuisine: string;
  course: string;
  method: string;
  typeName?: string;
  publishedAt: string;
  updatedAt: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  servingsUnit: string;
};

export type MemberHomeSavedPreview = {
  status: MemberHomeSectionStatus;
  /** Published saves only — most recent first. */
  recipes: MemberHomeRecipeCard[];
  /** Total RecipeSave rows for the member (includes hidden draft/orphan). */
  totalSaveCount: number;
  /** Count of currently visible Published saves. */
  visibleSaveCount: number;
};

export type MemberHomeCollectionPreviewItem = {
  id: string;
  name: string;
  updatedAt: string;
  visiblePublishedItemCount: number;
  latestPublishedRecipe: MemberHomeRecipeCard | null;
};

export type MemberHomeCollectionsPreview = {
  status: MemberHomeSectionStatus;
  collections: MemberHomeCollectionPreviewItem[];
  totalCollectionCount: number;
};

export type MemberHomeMealPreview = {
  itemId: string;
  recipeId: string | null;
  recipeSlug: string;
  recipeTitle: string;
  planDate: string;
  mealSlot: MealSlot;
  plannedServings: number;
};

export type MemberHomePlannerSummary = {
  status: MemberHomeSectionStatus;
  enabled: boolean;
  /**
   * False when the member has zero MealPlan rows.
   * Profile Home MUST NOT create a default plan to flip this true.
   */
  hasPlan: boolean;
  plan: { id: string; name: string } | null;
  /**
   * True only when a browser-local civil `weekAnchorYmd` was supplied and parsed.
   * Without it, mealCount/nextMeals stay empty — avoids assuming server UTC = member local day.
   */
  weekResolved: boolean;
  weekStartMonday: string | null;
  /** Items on the selected plan within the resolved week (all availabilities). */
  mealCount: number;
  /** Available Published meals from weekAnchor forward within the week (max 3). */
  nextMeals: MemberHomeMealPreview[];
};

export type MemberHomeRecommendationReasonType =
  | "because_saved"
  | "category"
  | "saved_preferences";

export type MemberHomeRecommendationReason = {
  type: MemberHomeRecommendationReasonType;
  label: string;
};

export type MemberHomeRecommendation = {
  recipe: MemberHomeRecipeCard;
  score: number;
  reason: MemberHomeRecommendationReason;
};

export type MemberHomeRecommendations = {
  status: MemberHomeSectionStatus;
  items: MemberHomeRecommendation[];
};

export type MemberHomeDiscover = {
  status: MemberHomeSectionStatus;
  recipes: MemberHomeRecipeCard[];
};

export type MemberHomeReadModel = {
  saved: MemberHomeSavedPreview;
  collections: MemberHomeCollectionsPreview;
  planner: MemberHomePlannerSummary;
  recommendations: MemberHomeRecommendations;
  discover: MemberHomeDiscover;
};

export type MemberHomeAffinity = {
  primaryCategories: Map<string, number>;
  courses: Map<string, number>;
  cuisines: Map<string, number>;
  types: Map<string, number>;
  methods: Map<string, number>;
};

type ScoredCandidate = {
  recipe: Recipe;
  score: number;
  primaryCategory: string;
  topRelatedSave: Recipe | null;
  topRelatedScore: number;
  dominantCategory: string | null;
};

function normKey(raw: string | undefined | null): string {
  return (raw || "").trim().toLowerCase();
}

function primaryCategorySlug(recipe: Pick<Recipe, "categories">): string {
  return (recipe.categories[0] || "").trim().toLowerCase();
}

export function toMemberHomeRecipeCard(recipe: Recipe): MemberHomeRecipeCard {
  return {
    id: (recipe.id?.trim() || recipe.slug).trim(),
    slug: recipe.slug,
    title: recipe.title,
    excerpt: recipe.excerpt,
    image: recipe.image,
    imageAlt: recipe.imageAlt,
    categories: [...recipe.categories],
    cuisine: recipe.cuisine,
    course: recipe.course,
    method: recipe.method,
    typeName: recipe.typeName,
    publishedAt: recipe.publishedAt,
    updatedAt: recipe.updatedAt,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    servings: recipe.servings,
    servingsUnit: recipe.servingsUnit,
  };
}

/** Build frequency maps from Published saved Recipes only. */
export function buildMemberHomeAffinity(savedPublished: Recipe[]): MemberHomeAffinity {
  const affinity: MemberHomeAffinity = {
    primaryCategories: new Map(),
    courses: new Map(),
    cuisines: new Map(),
    types: new Map(),
    methods: new Map(),
  };

  const bump = (map: Map<string, number>, key: string) => {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  };

  for (const recipe of savedPublished) {
    bump(affinity.primaryCategories, primaryCategorySlug(recipe));
    bump(affinity.courses, normKey(recipe.course));
    bump(affinity.cuisines, normKey(recipe.cuisine));
    bump(affinity.types, normKey(recipe.typeName));
    bump(affinity.methods, normKey(recipe.method));
  }

  return affinity;
}

function dominantKey(map: Map<string, number>): string | null {
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of map) {
    if (!key) continue;
    if (count > bestCount || (count === bestCount && bestKey !== null && key < bestKey)) {
      bestCount = count;
      bestKey = key;
    } else if (bestKey === null && count > 0) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey;
}

function affinityHitScore(map: Map<string, number>, key: string, weight: number): number {
  if (!key || !map.has(key)) return 0;
  return weight;
}

/**
 * Score one Published candidate against Published saves.
 * Empty seriesPeers — Home ranking is not series-shelf driven.
 */
export function scoreMemberHomeCandidate(
  candidate: Recipe,
  savedPublished: Recipe[],
  affinity: MemberHomeAffinity,
): ScoredCandidate {
  let score = 0;
  const primary = primaryCategorySlug(candidate);
  score += affinityHitScore(affinity.primaryCategories, primary, MEMBER_HOME_SCORE_PRIMARY_CATEGORY);
  score += affinityHitScore(affinity.courses, normKey(candidate.course), MEMBER_HOME_SCORE_COURSE);
  score += affinityHitScore(affinity.cuisines, normKey(candidate.cuisine), MEMBER_HOME_SCORE_CUISINE);
  score += affinityHitScore(affinity.types, normKey(candidate.typeName), MEMBER_HOME_SCORE_TYPE);
  score += affinityHitScore(affinity.methods, normKey(candidate.method), MEMBER_HOME_SCORE_METHOD);

  let topRelatedSave: Recipe | null = null;
  let topRelatedScore = 0;
  const emptyPeers = new Set<string>();
  for (const saved of savedPublished) {
    const related = scoreRelatedRecipe(saved, candidate, emptyPeers);
    if (related <= 0) continue;
    const savedKey = saved.id?.trim() || saved.slug;
    const topKey = topRelatedSave ? topRelatedSave.id?.trim() || topRelatedSave.slug : "";
    if (
      related > topRelatedScore ||
      (related === topRelatedScore && (!topRelatedSave || savedKey < topKey))
    ) {
      topRelatedScore = related;
      topRelatedSave = saved;
    }
  }

  const relatedContribution = Math.min(
    MEMBER_HOME_RELATED_SCORE_CAP,
    topRelatedScore * MEMBER_HOME_RELATED_SCORE_SCALE,
  );
  score += relatedContribution;

  return {
    recipe: candidate,
    score,
    primaryCategory: primary,
    topRelatedSave,
    topRelatedScore,
    dominantCategory: dominantKey(affinity.primaryCategories),
  };
}

function compareScored(a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  const aPub = Date.parse(a.recipe.publishedAt) || 0;
  const bPub = Date.parse(b.recipe.publishedAt) || 0;
  if (bPub !== aPub) return bPub - aPub;
  const titleCmp = a.recipe.title.localeCompare(b.recipe.title);
  if (titleCmp !== 0) return titleCmp;
  return (a.recipe.id || a.recipe.slug).localeCompare(b.recipe.id || b.recipe.slug);
}

function buildReason(entry: ScoredCandidate): MemberHomeRecommendationReason {
  if (
    entry.topRelatedSave &&
    entry.topRelatedScore >= MEMBER_HOME_BECAUSE_SAVED_RELATED_MIN
  ) {
    return {
      type: "because_saved",
      label: `Because you saved ${entry.topRelatedSave.title}`,
    };
  }

  const categoryKey = entry.dominantCategory;
  if (categoryKey && entry.primaryCategory === categoryKey) {
    const labelName =
      PRIMARY_CATEGORY_LABELS[categoryKey as PrimaryCategorySlug] || categoryKey;
    return {
      type: "category",
      label: `More from ${labelName}`,
    };
  }

  return {
    type: "saved_preferences",
    label: "Based on recipes you saved",
  };
}

/**
 * Deterministic recommendation ranking.
 * Same inputs → same order. No Recently Viewed. No SearchEvent. No RNG.
 */
export function rankMemberHomeRecommendations(input: {
  publishedCandidates: Recipe[];
  savedPublished: Recipe[];
}): MemberHomeRecommendation[] {
  const savedPublished = input.savedPublished;
  if (savedPublished.length < MEMBER_HOME_RECOMMENDATION_MIN_SAVES) return [];

  const savedSlugs = new Set(savedPublished.map((recipe) => recipe.slug));
  const savedIds = new Set(
    savedPublished.map((recipe) => recipe.id?.trim()).filter(Boolean) as string[],
  );

  const affinity = buildMemberHomeAffinity(savedPublished);
  const seenCandidate = new Set<string>();
  const scored = input.publishedCandidates
    .filter((recipe) => {
      const key = recipe.id?.trim() || recipe.slug;
      if (seenCandidate.has(key) || seenCandidate.has(recipe.slug)) return false;
      seenCandidate.add(key);
      seenCandidate.add(recipe.slug);
      if (savedSlugs.has(recipe.slug)) return false;
      const id = recipe.id?.trim();
      if (id && savedIds.has(id)) return false;
      return true;
    })
    .map((recipe) => scoreMemberHomeCandidate(recipe, savedPublished, affinity))
    .filter((entry) => entry.score >= MEMBER_HOME_RECOMMENDATION_MIN_SCORE)
    .sort(compareScored);

  // Diversity: at most N per primary category, preserving score order.
  const picked: ScoredCandidate[] = [];
  const perCategory = new Map<string, number>();
  for (const entry of scored) {
    if (picked.length >= MEMBER_HOME_RECOMMENDATION_MAX) break;
    const key = entry.primaryCategory || "__none__";
    const used = perCategory.get(key) || 0;
    if (used >= MEMBER_HOME_RECOMMENDATION_MAX_PER_PRIMARY_CATEGORY) continue;
    perCategory.set(key, used + 1);
    picked.push(entry);
  }

  if (picked.length < MEMBER_HOME_RECOMMENDATION_MIN_RESULTS) return [];

  return picked.map((entry) => ({
    recipe: toMemberHomeRecipeCard(entry.recipe),
    score: entry.score,
    reason: buildReason(entry),
  }));
}

/** Latest Published recipes for cold-start / thin personalization fallback. */
export function selectMemberHomeDiscover(published: Recipe[], limit = MEMBER_HOME_DISCOVER_MAX): MemberHomeRecipeCard[] {
  return [...published]
    .sort((a, b) => {
      const aTime = Date.parse(a.updatedAt) || Date.parse(a.publishedAt) || 0;
      const bTime = Date.parse(b.updatedAt) || Date.parse(b.publishedAt) || 0;
      if (bTime !== aTime) return bTime - aTime;
      return a.title.localeCompare(b.title) || (a.id || a.slug).localeCompare(b.id || b.slug);
    })
    .slice(0, limit)
    .map(toMemberHomeRecipeCard);
}

export function buildMemberHomeSavedPreview(input: {
  saves: { slug: string; recipeId?: string | null; createdAt?: Date | string }[];
  publishedBySlug: Map<string, Recipe>;
  publishedById: Map<string, Recipe>;
}): MemberHomeSavedPreview {
  const recipes: MemberHomeRecipeCard[] = [];
  const seen = new Set<string>();

  for (const save of input.saves) {
    const byId = save.recipeId ? input.publishedById.get(save.recipeId) : undefined;
    const recipe = byId || input.publishedBySlug.get(save.slug);
    if (!recipe) continue;
    const key = recipe.id?.trim() || recipe.slug;
    if (seen.has(key)) continue;
    seen.add(key);
    recipes.push(toMemberHomeRecipeCard(recipe));
    if (recipes.length >= MEMBER_HOME_SAVED_PREVIEW_MAX) break;
  }

  const visibleSaveCount = input.saves.reduce((count, save) => {
    const byId = save.recipeId ? input.publishedById.get(save.recipeId) : undefined;
    if (byId || input.publishedBySlug.get(save.slug)) return count + 1;
    return count;
  }, 0);

  return {
    status: recipes.length > 0 ? "ok" : "empty",
    recipes,
    totalSaveCount: input.saves.length,
    visibleSaveCount,
  };
}

/**
 * First plan from Meal Planner list order (updatedAt DESC, name ASC, id ASC).
 * Does not create plans.
 */
export function selectMemberHomePlan<T>(plans: T[]): T | null {
  return plans[0] ?? null;
}

/**
 * Upcoming available meals from `fromPlanDate` inclusive.
 * Omits draft/orphan/unavailable items. Never copies `note`.
 */
export function selectMemberHomeNextMeals(
  items: MemberHomeMealItemInput[],
  fromPlanDate: string,
  limit = MEMBER_HOME_PLANNER_NEXT_MEALS_MAX,
): MemberHomeMealPreview[] {
  const nextMeals: MemberHomeMealPreview[] = [];
  for (const item of items) {
    if (item.planDate < fromPlanDate) continue;
    if (item.recipeAvailability !== "available" || !item.publicRecipeSlug) continue;
    nextMeals.push({
      itemId: item.id,
      recipeId: item.recipeId,
      recipeSlug: item.publicRecipeSlug,
      recipeTitle: item.recipeTitle,
      planDate: item.planDate,
      mealSlot: item.mealSlot,
      plannedServings: item.plannedServings,
    });
    if (nextMeals.length >= limit) break;
  }
  return nextMeals;
}
