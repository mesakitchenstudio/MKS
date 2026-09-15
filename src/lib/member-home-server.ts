/**
 * Phase 7B — Personalized Member Home server aggregator.
 *
 * Identity: trusted `userId` from authenticated server context only.
 * NEVER call ensureDefaultMealPlanForUser — Profile read must not create plans.
 * Recently Viewed is not used here.
 */

import "server-only";

import type { Recipe } from "@/data/types";
import { getDb } from "@/lib/db";
import {
  endOfWeekSunday,
  isMealPlannerEnabled,
  startOfWeekMonday,
  validateMealPlanDate,
  type MealPlanSummary,
} from "@/lib/meal-planner";
import { getMealPlanForUser, listMealPlansForUser } from "@/lib/meal-planner-server";
import { getAllRecipes, type PublicRecipe } from "@/lib/recipes";
import { getMemberSavedCollections } from "@/lib/saved-recipe-collections-server";
import {
  MEMBER_HOME_COLLECTION_PREVIEW_MAX,
  buildMemberHomeSavedPreview,
  rankMemberHomeRecommendations,
  selectMemberHomeDiscover,
  selectMemberHomeNextMeals,
  selectMemberHomePlan,
  toMemberHomeRecipeCard,
  type MemberHomeCollectionPreviewItem,
  type MemberHomeCollectionsPreview,
  type MemberHomeDiscover,
  type MemberHomePlannerSummary,
  type MemberHomeReadModel,
  type MemberHomeRecipeCard,
  type MemberHomeRecommendations,
  type MemberHomeSavedPreview,
} from "@/lib/member-home";

export type GetPersonalizedMemberHomeOptions = {
  /**
   * Browser-local civil date (YYYY-MM-DD) from Phase 7C/7D.
   * When omitted, planner week meals are not resolved (avoids UTC-as-local mistakes).
   */
  weekAnchorYmd?: string;
  /** Optional Published catalogue override (tests). */
  publishedRecipes?: PublicRecipe[];
};

type SaveRow = { slug: string; recipeId: string | null; createdAt: Date };

function publishedIndexes(published: Recipe[]) {
  const bySlug = new Map<string, Recipe>();
  const byId = new Map<string, Recipe>();
  for (const recipe of published) {
    bySlug.set(recipe.slug, recipe);
    const id = recipe.id?.trim();
    if (id) byId.set(id, recipe);
  }
  return { bySlug, byId };
}

function emptySaved(): MemberHomeSavedPreview {
  return {
    status: "empty",
    recipes: [],
    totalSaveCount: 0,
    visibleSaveCount: 0,
  };
}

function emptyCollections(): MemberHomeCollectionsPreview {
  return { status: "empty", collections: [], totalCollectionCount: 0 };
}

function emptyRecommendations(): MemberHomeRecommendations {
  return { status: "empty", items: [] };
}

function emptyDiscover(): MemberHomeDiscover {
  return { status: "empty", recipes: [] };
}

function plannerDisabled(): MemberHomePlannerSummary {
  return {
    status: "empty",
    enabled: false,
    hasPlan: false,
    plan: null,
    weekResolved: false,
    weekStartMonday: null,
    mealCount: 0,
    nextMeals: [],
  };
}

function plannerNoPlan(): MemberHomePlannerSummary {
  return {
    status: "empty",
    enabled: true,
    hasPlan: false,
    plan: null,
    weekResolved: false,
    weekStartMonday: null,
    mealCount: 0,
    nextMeals: [],
  };
}

function resolvePublishedSaves(
  saves: SaveRow[],
  bySlug: Map<string, Recipe>,
  byId: Map<string, Recipe>,
): Recipe[] {
  const savedPublished: Recipe[] = [];
  const seen = new Set<string>();
  for (const save of saves) {
    const recipe =
      (save.recipeId ? byId.get(save.recipeId) : undefined) || bySlug.get(save.slug);
    if (!recipe) continue;
    const key = recipe.id?.trim() || recipe.slug;
    if (seen.has(key)) continue;
    seen.add(key);
    savedPublished.push(recipe);
  }
  return savedPublished;
}

async function loadCollectionsPreview(
  userId: string,
  published: Recipe[],
): Promise<MemberHomeCollectionsPreview> {
  const summaries = await getMemberSavedCollections(userId, published);
  const { bySlug } = publishedIndexes(published);

  const top = summaries.slice(0, MEMBER_HOME_COLLECTION_PREVIEW_MAX);
  const topIds = top.map((row) => row.id);
  const latestByCollection = new Map<string, MemberHomeRecipeCard | null>();

  if (topIds.length > 0) {
    const rows = await getDb().savedRecipeCollectionItem.findMany({
      where: { collectionId: { in: topIds } },
      orderBy: { createdAt: "desc" },
      include: {
        recipeSave: {
          select: {
            slug: true,
            recipeId: true,
            recipe: { select: { slug: true, status: true } },
          },
        },
      },
    });

    for (const row of rows) {
      if (latestByCollection.has(row.collectionId)) continue;
      const slug = row.recipeSave.recipe?.slug || row.recipeSave.slug;
      const recipe = bySlug.get(slug);
      latestByCollection.set(row.collectionId, recipe ? toMemberHomeRecipeCard(recipe) : null);
    }
  }

  const collections: MemberHomeCollectionPreviewItem[] = top.map((row) => ({
    id: row.id,
    name: row.name,
    updatedAt: row.updatedAt,
    visiblePublishedItemCount: row.visibleCount,
    latestPublishedRecipe: latestByCollection.get(row.id) ?? null,
  }));

  return {
    status: summaries.length > 0 ? "ok" : "empty",
    collections,
    totalCollectionCount: summaries.length,
  };
}

function selectPlan(plans: MealPlanSummary[]): MealPlanSummary | null {
  // listMealPlansForUser already: updatedAt DESC, name ASC, id ASC.
  return selectMemberHomePlan(plans);
}

async function loadPlannerSummary(
  userId: string,
  weekAnchorYmd?: string,
): Promise<MemberHomePlannerSummary> {
  if (!isMealPlannerEnabled()) return plannerDisabled();

  // READ-ONLY — never ensureDefaultMealPlanForUser.
  const plans = await listMealPlansForUser(userId);
  const plan = selectPlan(plans);
  if (!plan) return plannerNoPlan();

  const base: MemberHomePlannerSummary = {
    status: "ok",
    enabled: true,
    hasPlan: true,
    plan: { id: plan.id, name: plan.name },
    weekResolved: false,
    weekStartMonday: null,
    mealCount: 0,
    nextMeals: [],
  };

  if (!weekAnchorYmd) return base;

  const date = validateMealPlanDate(weekAnchorYmd);
  if (!date.ok) return base;

  const weekStart = startOfWeekMonday(date.planDate);
  const weekEnd = weekStart ? endOfWeekSunday(weekStart) : null;
  if (!weekStart || !weekEnd) return base;

  const detail = await getMealPlanForUser(userId, plan.id, {
    fromDate: weekStart,
    toDate: weekEnd,
  });
  if (!detail) {
    return { ...base, status: "unavailable" };
  }

  const weekItems = detail.items;
  const nextMeals = selectMemberHomeNextMeals(weekItems, date.planDate);

  return {
    ...base,
    weekResolved: true,
    weekStartMonday: weekStart,
    mealCount: weekItems.length,
    nextMeals,
  };
}

/**
 * Read-only planner week summary for Profile “This week”.
 * Does not create plans. Requires a validated browser-local civil date.
 */
export async function getMemberHomePlannerWeekForUser(
  userId: string,
  weekAnchorYmd: string,
): Promise<MemberHomePlannerSummary> {
  if (!userId) {
    throw new Error("getMemberHomePlannerWeekForUser requires an authenticated member userId");
  }
  return loadPlannerSummary(userId, weekAnchorYmd);
}

/**
 * Trusted-userId aggregator for Personalized Member Home.
 * Call only after auth → active member resolution on the server.
 *
 * Throws when userId is missing — auth failures must not be swallowed as empty Home.
 */
export async function getPersonalizedMemberHomeForUser(
  userId: string,
  options: GetPersonalizedMemberHomeOptions = {},
): Promise<MemberHomeReadModel> {
  if (!userId) {
    throw new Error("getPersonalizedMemberHomeForUser requires an authenticated member userId");
  }

  const published = options.publishedRecipes ?? (await getAllRecipes());
  const { bySlug, byId } = publishedIndexes(published);

  let saved: MemberHomeSavedPreview = emptySaved();
  let collections: MemberHomeCollectionsPreview = emptyCollections();
  let planner: MemberHomePlannerSummary = plannerDisabled();
  let recommendations: MemberHomeRecommendations = emptyRecommendations();
  let discover: MemberHomeDiscover = emptyDiscover();

  let saves: SaveRow[] = [];
  try {
    saves = await getDb().recipeSave.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { slug: true, recipeId: true, createdAt: true },
    });
    saved = buildMemberHomeSavedPreview({
      saves,
      publishedBySlug: bySlug,
      publishedById: byId,
    });
  } catch {
    saved = { ...emptySaved(), status: "unavailable" };
  }

  try {
    collections = await loadCollectionsPreview(userId, published);
  } catch {
    collections = { ...emptyCollections(), status: "unavailable" };
  }

  try {
    planner = await loadPlannerSummary(userId, options.weekAnchorYmd);
  } catch {
    planner = {
      ...plannerDisabled(),
      enabled: isMealPlannerEnabled(),
      status: "unavailable",
    };
  }

  try {
    const savedPublished = resolvePublishedSaves(saves, bySlug, byId);
    const items = rankMemberHomeRecommendations({
      publishedCandidates: published,
      savedPublished,
    });
    recommendations = {
      status: items.length > 0 ? "ok" : "empty",
      items,
    };
  } catch {
    recommendations = { ...emptyRecommendations(), status: "unavailable" };
  }

  try {
    const recipes = selectMemberHomeDiscover(published);
    discover = {
      status: recipes.length > 0 ? "ok" : "empty",
      recipes,
    };
  } catch {
    discover = { ...emptyDiscover(), status: "unavailable" };
  }

  return { saved, collections, planner, recommendations, discover };
}
