/**
 * Cook With What You Have (ING-6).
 *
 * Pantry = ingredients the visitor HAS.
 * Matching compares each Published Recipe's required identities against the pantry.
 * This is NOT ING-5 "recipes that contain these ingredients" filtering.
 *
 * Limitations (v1):
 * - No optional-ingredient inference (every non-empty row participates).
 * - No staple assumptions (salt/pepper/oil/water/sugar all count).
 * - No hierarchy (Egg ≠ Egg yolk unless same canonical id).
 * - Availability identity only — quantities/units are ignored.
 * - Amounts/notes for shopping lists: ING-7 should reload Recipe.values.
 */

import type { getDb } from "@/lib/db";
import {
  canonicalizeSlugList,
  isIngredientDiscoveryEnabled,
  loadPublicIngredientFilterOptions,
  resolveIngredientSlugsToIds,
  type PublicIngredientOption,
} from "@/lib/ingredient-discovery";
import type { PublicRecipe } from "@/lib/recipes";

type DbClient = ReturnType<typeof getDb>;

export const CWYH_MAX_PANTRY = 12;
export const CWYH_MAX_RESULTS = 24;
export const CWYH_MAX_MISSING_RESOLVED = 3;
export const CWYH_PATH = "/cook-with-what-you-have";

/** Both gates required. Default OFF. */
export function isCookWithWhatYouHaveEnabled(): boolean {
  return (
    isIngredientDiscoveryEnabled() &&
    process.env.COOK_WITH_WHAT_YOU_HAVE_ENABLED === "true"
  );
}

export type CwyhMissingItem = {
  ingredientId?: string;
  displayText: string;
  kind: "resolved" | "unresolved";
  /** Optional source hint for ING-7 shopping list (position only; amounts from Recipe.values later). */
  source?: {
    groupIndex: number;
    itemIndex: number;
  };
};

export type CookWithWhatYouHaveMatch = {
  recipeId: string;
  recipeSlug: string;
  title: string;
  publishedAt: string;
  requiredResolvedCount: number;
  pantryMatchedCount: number;
  missingResolvedCount: number;
  unresolvedCount: number;
  coverageRatio: number;
  classificationComplete: boolean;
  canMakeClaim: boolean;
  /** missingResolved + unresolved — visitor-facing group key */
  effectiveMissingCount: number;
  matchedIngredientIds: string[];
  missing: CwyhMissingItem[];
};

export type CwyhIngredientRow = {
  recipeId: string;
  ingredientId: string | null;
  authoredItem: string;
  authoredItemNorm: string;
  groupIndex: number;
  itemIndex: number;
  ingredientName?: string | null;
};

export type CwyhResultGroup = {
  key: "exact" | "missing-1" | "missing-2" | "missing-3";
  title: string;
  matches: CookWithWhatYouHaveMatch[];
};

export function parseHaveParam(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.trim()) return [];
  return canonicalizeSlugList(value.split(","), CWYH_MAX_PANTRY);
}

export function buildCwyhUrl(haveSlugs: string[]): string {
  const list = canonicalizeSlugList(haveSlugs, CWYH_MAX_PANTRY);
  // Join directly — do not reuse ING-5 serialize max (8).
  return list.length ? `${CWYH_PATH}?have=${list.join(",")}` : CWYH_PATH;
}

export function isCwyhListingNoIndex(haveSlugs: string[]): boolean {
  return haveSlugs.length > 0;
}

/**
 * Pure matcher: score Published Recipes against pantry Ingredient IDs.
 */
export function matchRecipesToPantry(input: {
  pantryIngredientIds: string[];
  recipes: Array<{ id: string; slug: string; title: string; publishedAt: string }>;
  ingredientRows: CwyhIngredientRow[];
}): CookWithWhatYouHaveMatch[] {
  const pantry = new Set(input.pantryIngredientIds.filter(Boolean));
  const rowsByRecipe = new Map<string, CwyhIngredientRow[]>();
  for (const row of input.ingredientRows) {
    const list = rowsByRecipe.get(row.recipeId);
    if (list) list.push(row);
    else rowsByRecipe.set(row.recipeId, [row]);
  }

  const matches: CookWithWhatYouHaveMatch[] = [];

  for (const recipe of input.recipes) {
    const rows = rowsByRecipe.get(recipe.id) ?? [];
    const resolvedById = new Map<string, CwyhIngredientRow>();
    const unresolvedByNorm = new Map<string, CwyhIngredientRow>();

    for (const row of rows) {
      if (row.ingredientId) {
        if (!resolvedById.has(row.ingredientId)) {
          resolvedById.set(row.ingredientId, row);
        }
      } else {
        const norm = String(row.authoredItemNorm || "").trim() || String(row.authoredItem || "").trim().toLowerCase();
        if (!norm) continue;
        if (!unresolvedByNorm.has(norm)) {
          unresolvedByNorm.set(norm, row);
        }
      }
    }

    const requiredResolvedCount = resolvedById.size;
    if (requiredResolvedCount === 0) continue;

    const matchedIngredientIds: string[] = [];
    const missingResolved: CwyhMissingItem[] = [];
    for (const [ingredientId, row] of resolvedById) {
      if (pantry.has(ingredientId)) {
        matchedIngredientIds.push(ingredientId);
      } else {
        missingResolved.push({
          ingredientId,
          displayText:
            String(row.authoredItem || "").trim() ||
            String(row.ingredientName || "").trim() ||
            "Ingredient",
          kind: "resolved",
          source: { groupIndex: row.groupIndex, itemIndex: row.itemIndex },
        });
      }
    }

    const unresolvedMissing: CwyhMissingItem[] = [...unresolvedByNorm.values()].map((row) => ({
      displayText: String(row.authoredItem || "").trim() || "Ingredient",
      kind: "unresolved" as const,
      source: { groupIndex: row.groupIndex, itemIndex: row.itemIndex },
    }));

    const missingResolvedCount = missingResolved.length;
    const unresolvedCount = unresolvedMissing.length;
    if (missingResolvedCount > CWYH_MAX_MISSING_RESOLVED) continue;

    const pantryMatchedCount = matchedIngredientIds.length;
    const coverageRatio = pantryMatchedCount / requiredResolvedCount;
    const classificationComplete = unresolvedCount === 0;
    const canMakeClaim = missingResolvedCount === 0 && classificationComplete;
    const effectiveMissingCount = missingResolvedCount + unresolvedCount;

    matches.push({
      recipeId: recipe.id,
      recipeSlug: recipe.slug,
      title: recipe.title,
      publishedAt: recipe.publishedAt,
      requiredResolvedCount,
      pantryMatchedCount,
      missingResolvedCount,
      unresolvedCount,
      coverageRatio,
      classificationComplete,
      canMakeClaim,
      effectiveMissingCount,
      matchedIngredientIds,
      missing: [...missingResolved, ...unresolvedMissing],
    });
  }

  return rankCwyhMatches(matches);
}

export function rankCwyhMatches(matches: CookWithWhatYouHaveMatch[]): CookWithWhatYouHaveMatch[] {
  return [...matches].sort((a, b) => {
    if (a.missingResolvedCount !== b.missingResolvedCount) {
      return a.missingResolvedCount - b.missingResolvedCount;
    }
    if (a.unresolvedCount !== b.unresolvedCount) {
      return a.unresolvedCount - b.unresolvedCount;
    }
    if (a.coverageRatio !== b.coverageRatio) {
      return b.coverageRatio - a.coverageRatio;
    }
    if (a.pantryMatchedCount !== b.pantryMatchedCount) {
      return b.pantryMatchedCount - a.pantryMatchedCount;
    }
    const aTime = Date.parse(a.publishedAt) || 0;
    const bTime = Date.parse(b.publishedAt) || 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.title.localeCompare(b.title);
  });
}

export function groupCwyhMatches(matches: CookWithWhatYouHaveMatch[]): CwyhResultGroup[] {
  const capped = matches.slice(0, CWYH_MAX_RESULTS);
  const buckets: Record<CwyhResultGroup["key"], CookWithWhatYouHaveMatch[]> = {
    exact: [],
    "missing-1": [],
    "missing-2": [],
    "missing-3": [],
  };

  for (const match of capped) {
    if (match.canMakeClaim) {
      buckets.exact.push(match);
      continue;
    }
    const effective = match.effectiveMissingCount;
    if (effective <= 1) buckets["missing-1"].push(match);
    else if (effective === 2) buckets["missing-2"].push(match);
    else buckets["missing-3"].push(match);
  }

  const groups: CwyhResultGroup[] = [];
  if (buckets.exact.length) {
    groups.push({ key: "exact", title: "You have everything", matches: buckets.exact });
  }
  if (buckets["missing-1"].length) {
    groups.push({
      key: "missing-1",
      title: "Missing 1 ingredient",
      matches: buckets["missing-1"],
    });
  }
  if (buckets["missing-2"].length) {
    groups.push({
      key: "missing-2",
      title: "Missing 2 ingredients",
      matches: buckets["missing-2"],
    });
  }
  if (buckets["missing-3"].length) {
    groups.push({
      key: "missing-3",
      title: "Missing 3 ingredients",
      matches: buckets["missing-3"],
    });
  }
  return groups;
}

export function formatCwyhMissingLine(missing: CwyhMissingItem[], limit = 3): string {
  const labels = missing.map((item) => item.displayText).filter(Boolean);
  if (!labels.length) return "";
  const shown = labels.slice(0, limit);
  const extra = labels.length - shown.length;
  return extra > 0 ? `${shown.join(" · ")} · +${extra}` : shown.join(" · ");
}

/**
 * Load RecipeIngredient index rows for published recipe IDs (batched).
 */
export async function loadCwyhIngredientRowsForRecipes(
  db: DbClient,
  recipeIds: string[],
): Promise<CwyhIngredientRow[]> {
  if (!recipeIds.length) return [];
  try {
    const rows = await db.recipeIngredient.findMany({
      where: { recipeId: { in: recipeIds } },
      select: {
        recipeId: true,
        ingredientId: true,
        authoredItem: true,
        authoredItemNorm: true,
        groupIndex: true,
        itemIndex: true,
        ingredient: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      recipeId: row.recipeId,
      ingredientId: row.ingredientId,
      authoredItem: row.authoredItem,
      authoredItemNorm: row.authoredItemNorm,
      groupIndex: row.groupIndex,
      itemIndex: row.itemIndex,
      ingredientName: row.ingredient?.name ?? null,
    }));
  } catch {
    return [];
  }
}

export async function resolveCwyhPantry(
  db: DbClient,
  haveSlugs: string[],
): Promise<{
  slugs: string[];
  ingredientIds: string[];
  options: PublicIngredientOption[];
}> {
  const options = await loadPublicIngredientFilterOptions(db);
  const eligible = new Set(options.map((option) => option.slug));
  const slugs = canonicalizeSlugList(haveSlugs, CWYH_MAX_PANTRY).filter((slug) =>
    eligible.has(slug),
  );
  const idMap = await resolveIngredientSlugsToIds(db, slugs);
  const ingredientIds = slugs
    .map((slug) => idMap.get(slug))
    .filter((id): id is string => Boolean(id));
  return { slugs, ingredientIds, options };
}

export function buildCwyhMatchesForCatalog(input: {
  pantryIngredientIds: string[];
  recipes: PublicRecipe[];
  ingredientRows: CwyhIngredientRow[];
}): {
  matches: CookWithWhatYouHaveMatch[];
  groups: CwyhResultGroup[];
  exactCount: number;
  nearCount: number;
} {
  const catalog = input.recipes
    .map((recipe) => {
      const id = recipe.id?.trim();
      if (!id) return null;
      return {
        id,
        slug: recipe.slug,
        title: recipe.title,
        publishedAt: recipe.publishedAt,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const matches = matchRecipesToPantry({
    pantryIngredientIds: input.pantryIngredientIds,
    recipes: catalog,
    ingredientRows: input.ingredientRows,
  });
  const groups = groupCwyhMatches(matches);
  const exactCount = groups.find((group) => group.key === "exact")?.matches.length ?? 0;
  const nearCount = groups
    .filter((group) => group.key !== "exact")
    .reduce((sum, group) => sum + group.matches.length, 0);
  return { matches: matches.slice(0, CWYH_MAX_RESULTS), groups, exactCount, nearCount };
}
