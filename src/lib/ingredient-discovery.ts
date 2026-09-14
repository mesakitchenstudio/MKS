/**
 * Public ingredient-aware discovery (ING-5).
 * Uses canonical Ingredient.slug + RecipeIngredient.ingredientId.
 * Does not change general q= text search semantics.
 */

import type { getDb } from "@/lib/db";
import { normalizeIngredientLookupKey } from "@/lib/ingredient-identity";

type DbClient = ReturnType<typeof getDb>;

/** Default OFF. Enable with INGREDIENT_DISCOVERY_ENABLED=true after Production seed/backfill/review. */
export function isIngredientDiscoveryEnabled(): boolean {
  return process.env.INGREDIENT_DISCOVERY_ENABLED === "true";
}

export const MAX_INGREDIENT_FILTER_SELECTIONS = 8;

export type PublicIngredientOption = {
  slug: string;
  name: string;
  /** Distinct published recipe count. */
  recipeCount: number;
  /** Alias phrases used only for selector search (not rendered as options). */
  searchTexts: string[];
};

export type IngredientFilterSelection = {
  includeSlugs: string[];
  excludeSlugs: string[];
  mode: "all" | "any";
};

/**
 * Parse + canonicalize ingredient slug lists.
 * Exclude wins over include for the same slug.
 */
export function normalizeIngredientFilterSelection(input: {
  ingredients?: string[] | undefined;
  excludeIngredients?: string[] | undefined;
  ingredientMode?: "all" | "any" | undefined;
}): IngredientFilterSelection {
  const includeRaw = canonicalizeSlugList(input.ingredients, MAX_INGREDIENT_FILTER_SELECTIONS);
  const exclude = canonicalizeSlugList(input.excludeIngredients, MAX_INGREDIENT_FILTER_SELECTIONS);
  const excludeSet = new Set(exclude);
  const includeSlugs = includeRaw.filter((slug) => !excludeSet.has(slug));
  const mode =
    includeSlugs.length <= 1
      ? "all"
      : input.ingredientMode === "any"
        ? "any"
        : "all";
  return { includeSlugs, excludeSlugs: exclude, mode };
}

export function canonicalizeSlugList(
  values: string[] | undefined,
  max = MAX_INGREDIENT_FILTER_SELECTIONS,
): string[] {
  if (!values?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const slug = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= max) break;
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function hasActiveIngredientFilter(selection: IngredientFilterSelection): boolean {
  return selection.includeSlugs.length > 0 || selection.excludeSlugs.length > 0;
}

export function serializeIngredientSlugList(slugs: string[] | undefined): string | undefined {
  const list = canonicalizeSlugList(slugs);
  return list.length ? list.join(",") : undefined;
}

/**
 * Load canonical Ingredients with ≥1 Published RecipeIngredient match.
 * Includes alias search texts for combobox lookup only.
 */
export async function loadPublicIngredientFilterOptions(
  db: DbClient,
): Promise<PublicIngredientOption[]> {
  try {
    const rows = await db.recipeIngredient.findMany({
      where: {
        ingredientId: { not: null },
        recipe: { status: "published" },
      },
      select: {
        ingredientId: true,
        recipeId: true,
        ingredient: {
          select: {
            id: true,
            name: true,
            slug: true,
            aliases: { select: { alias: true, aliasNorm: true } },
          },
        },
      },
    });

    const byIngredient = new Map<
      string,
      {
        slug: string;
        name: string;
        recipes: Set<string>;
        searchTexts: Set<string>;
      }
    >();

    for (const row of rows) {
      if (!row.ingredientId || !row.ingredient) continue;
      const ing = row.ingredient;
      let entry = byIngredient.get(ing.id);
      if (!entry) {
        entry = {
          slug: ing.slug,
          name: ing.name,
          recipes: new Set(),
          searchTexts: new Set([ing.name, ing.slug]),
        };
        for (const alias of ing.aliases) {
          if (alias.alias.trim()) entry.searchTexts.add(alias.alias.trim());
          if (alias.aliasNorm) entry.searchTexts.add(alias.aliasNorm);
        }
        byIngredient.set(ing.id, entry);
      }
      entry.recipes.add(row.recipeId);
    }

    return [...byIngredient.values()]
      .map((entry) => ({
        slug: entry.slug,
        name: entry.name,
        recipeCount: entry.recipes.size,
        searchTexts: [...entry.searchTexts],
      }))
      .filter((row) => row.recipeCount >= 1)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Resolve public slugs → Ingredient ids. Unknown slugs omitted.
 */
export async function resolveIngredientSlugsToIds(
  db: DbClient,
  slugs: string[],
): Promise<Map<string, string>> {
  const list = canonicalizeSlugList(slugs, MAX_INGREDIENT_FILTER_SELECTIONS * 2);
  if (!list.length) return new Map();
  try {
    const rows = await db.ingredient.findMany({
      where: { slug: { in: list } },
      select: { id: true, slug: true },
    });
    return new Map(rows.map((row) => [row.slug, row.id]));
  } catch {
    return new Map();
  }
}

/**
 * Published recipe IDs matching include/exclude Ingredient filter.
 * Empty include + empty exclude → null (no constraint).
 * Empty include + excludes → all published minus excluded.
 */
export async function findPublishedRecipeIdsByIngredientFilter(
  db: DbClient,
  selection: IngredientFilterSelection,
): Promise<Set<string> | null> {
  if (!hasActiveIngredientFilter(selection)) return null;

  const includeMap = await resolveIngredientSlugsToIds(db, selection.includeSlugs);
  const excludeMap = await resolveIngredientSlugsToIds(db, selection.excludeSlugs);
  const includeIds = selection.includeSlugs
    .map((slug) => includeMap.get(slug))
    .filter((id): id is string => Boolean(id));
  const excludeIds = selection.excludeSlugs
    .map((slug) => excludeMap.get(slug))
    .filter((id): id is string => Boolean(id));

  // All selected include slugs invalid → no matches when includes were requested.
  if (selection.includeSlugs.length > 0 && includeIds.length === 0) {
    return new Set();
  }

  try {
    let candidates: Set<string> | null = null;

    if (includeIds.length > 0) {
      const rows = await db.recipeIngredient.findMany({
        where: {
          ingredientId: { in: includeIds },
          recipe: { status: "published" },
        },
        select: { recipeId: true, ingredientId: true },
        distinct: ["recipeId", "ingredientId"],
      });

      const byRecipe = new Map<string, Set<string>>();
      for (const row of rows) {
        if (!row.ingredientId) continue;
        let set = byRecipe.get(row.recipeId);
        if (!set) {
          set = new Set();
          byRecipe.set(row.recipeId, set);
        }
        set.add(row.ingredientId);
      }

      candidates = new Set<string>();
      const needed = new Set(includeIds);
      for (const [recipeId, found] of byRecipe) {
        if (selection.mode === "any") {
          for (const id of needed) {
            if (found.has(id)) {
              candidates.add(recipeId);
              break;
            }
          }
        } else {
          let ok = true;
          for (const id of needed) {
            if (!found.has(id)) {
              ok = false;
              break;
            }
          }
          if (ok) candidates.add(recipeId);
        }
      }
    }

    if (excludeIds.length > 0) {
      const excludedRows = await db.recipeIngredient.findMany({
        where: {
          ingredientId: { in: excludeIds },
          recipe: { status: "published" },
        },
        distinct: ["recipeId"],
        select: { recipeId: true },
      });
      const excluded = new Set(excludedRows.map((row) => row.recipeId));

      if (candidates == null) {
        const published = await db.recipe.findMany({
          where: { status: "published" },
          select: { id: true },
        });
        candidates = new Set(
          published.map((row) => row.id).filter((id) => !excluded.has(id)),
        );
      } else {
        for (const id of [...candidates]) {
          if (excluded.has(id)) candidates.delete(id);
        }
      }
    }

    return candidates ?? new Set();
  } catch {
    return new Set();
  }
}

/** Pure membership check for client dead-end analytics. */
export function recipeMatchesIngredientMembership(
  ingredientSlugsOnRecipe: string[] | undefined,
  selection: IngredientFilterSelection,
): boolean {
  if (!hasActiveIngredientFilter(selection)) return true;
  const have = new Set(ingredientSlugsOnRecipe ?? []);
  if (selection.excludeSlugs.some((slug) => have.has(slug))) return false;
  if (!selection.includeSlugs.length) return true;
  if (selection.mode === "any") {
    return selection.includeSlugs.some((slug) => have.has(slug));
  }
  return selection.includeSlugs.every((slug) => have.has(slug));
}

/**
 * Map recipeId → matched Ingredient slugs (Published recipes only).
 * Used for client-side filter recomputation / analytics.
 */
export async function loadPublishedRecipeIngredientSlugMembership(
  db: DbClient,
): Promise<Record<string, string[]>> {
  try {
    const rows = await db.recipeIngredient.findMany({
      where: {
        ingredientId: { not: null },
        recipe: { status: "published" },
      },
      select: {
        recipeId: true,
        ingredient: { select: { slug: true } },
      },
      distinct: ["recipeId", "ingredientId"],
    });
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      const slug = row.ingredient?.slug;
      if (!slug) continue;
      let set = map.get(row.recipeId);
      if (!set) {
        set = new Set();
        map.set(row.recipeId, set);
      }
      set.add(slug);
    }
    const out: Record<string, string[]> = {};
    for (const [id, set] of map) {
      out[id] = [...set];
    }
    return out;
  } catch {
    return {};
  }
}

/** Combobox: alias/name/slug text finds canonical option. */
export function filterPublicIngredientOptions(
  options: PublicIngredientOption[],
  query: string,
  limit = 12,
): PublicIngredientOption[] {
  const needle = normalizeIngredientLookupKey(query);
  if (!needle) return options.slice(0, limit);
  const scored: Array<{ option: PublicIngredientOption; score: number }> = [];
  for (const option of options) {
    const nameNorm = normalizeIngredientLookupKey(option.name);
    const slugNorm = normalizeIngredientLookupKey(option.slug);
    let score = 0;
    if (nameNorm === needle || slugNorm === needle) score = 100;
    else if (nameNorm.startsWith(needle) || slugNorm.startsWith(needle)) score = 80;
    else if (nameNorm.includes(needle)) score = 60;
    else if (
      option.searchTexts.some((text) => {
        const t = normalizeIngredientLookupKey(text);
        return t === needle || t.startsWith(needle) || t.includes(needle);
      })
    ) {
      score = 50;
    }
    if (score > 0) scored.push({ option, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name))
    .slice(0, limit)
    .map((row) => row.option);
}
