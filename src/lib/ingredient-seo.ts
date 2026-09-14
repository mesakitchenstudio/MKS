/**
 * Public Ingredient SEO helpers (ING-8).
 * No schema fields — name + Published Recipe density only.
 */

import { site } from "@/data/site";
import { absolutePublicUrl } from "@/lib/breadcrumb-jsonld";
import type { getDb } from "@/lib/db";
import { toPublicRecipe } from "@/lib/recipe-map";
import type { PublicRecipe } from "@/lib/recipes";

type DbClient = ReturnType<typeof getDb>;

/** Minimum distinct Published Recipes before an Ingredient page is search-indexable. */
export const INGREDIENT_INDEXABLE_MIN_RECIPES = 3;

export const INGREDIENT_SEO_PATH_PREFIX = "/ingredient";

/** Default OFF. Enable only after Production seed/backfill + SEO readiness review. */
export function isIngredientSeoEnabled(): boolean {
  return process.env.INGREDIENT_SEO_ENABLED === "true";
}

export function isIngredientPageIndexable(publishedRecipeCount: number): boolean {
  return publishedRecipeCount >= INGREDIENT_INDEXABLE_MIN_RECIPES;
}

export function ingredientPublicPath(slug: string): string {
  return `${INGREDIENT_SEO_PATH_PREFIX}/${String(slug || "").trim()}`;
}

export function ingredientPageTitleSegment(name: string): string {
  const trimmed = String(name || "").trim();
  return trimmed ? `${trimmed} Recipes` : "Ingredient Recipes";
}

export function ingredientMetaDescription(name: string): string {
  const trimmed = String(name || "").trim() || "this ingredient";
  return `Browse ${site.name} recipes featuring ${trimmed}.`;
}

export type IngredientPublicSeoState =
  | "NOT_PUBLIC"
  | "REACHABLE_NOINDEX"
  | "INDEXABLE";

export function classifyIngredientPublicSeoState(
  publishedRecipeCount: number,
): IngredientPublicSeoState {
  if (publishedRecipeCount <= 0) return "NOT_PUBLIC";
  if (!isIngredientPageIndexable(publishedRecipeCount)) return "REACHABLE_NOINDEX";
  return "INDEXABLE";
}

export function formatIngredientPublicSeoStatus(input: {
  seoEnabled: boolean;
  publishedRecipeCount: number;
}): string {
  const state = classifyIngredientPublicSeoState(input.publishedRecipeCount);
  if (!input.seoEnabled) {
    if (state === "INDEXABLE") return "SEO disabled · ready (≥3 published)";
    if (state === "REACHABLE_NOINDEX") return "SEO disabled · 1–2 published";
    return "SEO disabled · not public";
  }
  if (state === "INDEXABLE") return "Indexable";
  if (state === "REACHABLE_NOINDEX") return "Reachable · noindex";
  return "Not public";
}

export type IngredientItemListRecipe = {
  title: string;
  slug: string;
};

export function ingredientItemListJsonLd(input: {
  name: string;
  slug: string;
  description?: string;
  recipes: IngredientItemListRecipe[];
}) {
  const recipes = input.recipes.filter((recipe) => recipe.slug.trim() && recipe.title.trim());
  const title = ingredientPageTitleSegment(input.name);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    description: String(input.description || "").trim() || undefined,
    url: absolutePublicUrl(ingredientPublicPath(input.slug)),
    numberOfItems: recipes.length,
    itemListElement: recipes.map((recipe, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: recipe.title,
      url: absolutePublicUrl(`/recipes/${recipe.slug}`),
    })),
  };
}

export type PublicIngredientLanding = {
  ingredient: { id: string; name: string; slug: string };
  publishedRecipeCount: number;
  recipes: PublicRecipe[];
  indexable: boolean;
};

/**
 * Public Ingredient landing. Returns null when slug unknown or zero Published Recipes.
 */
export async function getPublicIngredientLanding(
  db: DbClient,
  slug: string,
): Promise<PublicIngredientLanding | null> {
  const normalizedSlug = String(slug || "")
    .trim()
    .toLowerCase();
  if (!normalizedSlug) return null;

  try {
    const ingredient = await db.ingredient.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true, name: true, slug: true },
    });
    if (!ingredient) return null;

    const membership = await db.recipeIngredient.findMany({
      where: {
        ingredientId: ingredient.id,
        recipe: { status: "published" },
      },
      distinct: ["recipeId"],
      select: { recipeId: true },
    });
    const recipeIds = membership.map((row) => row.recipeId);
    if (!recipeIds.length) return null;

    const rows = await db.recipe.findMany({
      where: { id: { in: recipeIds }, status: "published" },
      include: {
        categories: { include: { category: true } },
        type: { include: { fields: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { title: "asc" }],
    });

    const recipes = rows.map((row) => toPublicRecipe(row));
    const publishedRecipeCount = recipes.length;
    return {
      ingredient,
      publishedRecipeCount,
      recipes,
      indexable: isIngredientPageIndexable(publishedRecipeCount),
    };
  } catch {
    return null;
  }
}

/** Slugs with ≥ INGREDIENT_INDEXABLE_MIN_RECIPES distinct Published Recipes. */
export async function listIndexableIngredientSlugs(db: DbClient): Promise<string[]> {
  try {
    const rows = await db.recipeIngredient.findMany({
      where: {
        ingredientId: { not: null },
        recipe: { status: "published" },
      },
      distinct: ["ingredientId", "recipeId"],
      select: {
        ingredientId: true,
        ingredient: { select: { slug: true } },
      },
    });

    const counts = new Map<string, { slug: string; count: number }>();
    for (const row of rows) {
      if (!row.ingredientId || !row.ingredient?.slug) continue;
      const existing = counts.get(row.ingredientId);
      if (existing) existing.count += 1;
      else counts.set(row.ingredientId, { slug: row.ingredient.slug, count: 1 });
    }

    return [...counts.values()]
      .filter((entry) => isIngredientPageIndexable(entry.count))
      .map((entry) => entry.slug)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Ingredients with ≥1 Published Recipe (for generateStaticParams). */
export async function listReachableIngredientSlugs(db: DbClient): Promise<string[]> {
  try {
    const rows = await db.recipeIngredient.findMany({
      where: {
        ingredientId: { not: null },
        recipe: { status: "published" },
      },
      distinct: ["ingredientId"],
      select: {
        ingredient: { select: { slug: true } },
      },
    });
    return rows
      .map((row) => row.ingredient?.slug?.trim() || "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/**
 * Batch eligibility for Recipe detail Ingredient links.
 * Returns ingredientId → { slug } only when indexable and SEO gate is ON (caller checks gate).
 */
export async function loadIndexableIngredientLinkMap(
  db: DbClient,
  ingredientIds: string[],
): Promise<Map<string, { slug: string; name: string }>> {
  const out = new Map<string, { slug: string; name: string }>();
  const ids = [...new Set(ingredientIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return out;

  try {
    const ingredients = await db.ingredient.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, name: true },
    });
    if (!ingredients.length) return out;

    const membership = await db.recipeIngredient.findMany({
      where: {
        ingredientId: { in: ingredients.map((row) => row.id) },
        recipe: { status: "published" },
      },
      distinct: ["ingredientId", "recipeId"],
      select: { ingredientId: true },
    });
    const counts = new Map<string, number>();
    for (const row of membership) {
      if (!row.ingredientId) continue;
      counts.set(row.ingredientId, (counts.get(row.ingredientId) ?? 0) + 1);
    }

    for (const ingredient of ingredients) {
      const count = counts.get(ingredient.id) ?? 0;
      if (!isIngredientPageIndexable(count)) continue;
      out.set(ingredient.id, { slug: ingredient.slug, name: ingredient.name });
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * Resolve Recipe.values positions → Ingredient SEO link slug when eligible.
 */
export async function loadRecipeIngredientSeoLinks(
  db: DbClient,
  recipeId: string | undefined,
): Promise<Record<string, string>> {
  const links: Record<string, string> = {};
  const id = recipeId?.trim();
  if (!id || !isIngredientSeoEnabled()) return links;

  try {
    const rows = await db.recipeIngredient.findMany({
      where: { recipeId: id, ingredientId: { not: null } },
      select: {
        groupIndex: true,
        itemIndex: true,
        ingredientId: true,
      },
    });
    const ids = rows
      .map((row) => row.ingredientId)
      .filter((value): value is string => Boolean(value));
    const eligible = await loadIndexableIngredientLinkMap(db, ids);
    for (const row of rows) {
      if (!row.ingredientId) continue;
      const target = eligible.get(row.ingredientId);
      if (!target) continue;
      links[`${row.groupIndex}:${row.itemIndex}`] = target.slug;
    }
  } catch {
    return links;
  }
  return links;
}

export type IngredientSeoReadinessRow = {
  name: string;
  slug: string;
  publishedRecipeCount: number;
  publicState: IngredientPublicSeoState;
  indexable: boolean;
};

export async function reportIngredientSeoReadiness(
  db: DbClient,
): Promise<IngredientSeoReadinessRow[]> {
  try {
    const ingredients = await db.ingredient.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });
    if (!ingredients.length) return [];

    const membership = await db.recipeIngredient.findMany({
      where: {
        ingredientId: { not: null },
        recipe: { status: "published" },
      },
      distinct: ["ingredientId", "recipeId"],
      select: { ingredientId: true },
    });
    const counts = new Map<string, number>();
    for (const row of membership) {
      if (!row.ingredientId) continue;
      counts.set(row.ingredientId, (counts.get(row.ingredientId) ?? 0) + 1);
    }

    const rows: IngredientSeoReadinessRow[] = ingredients.map((ingredient) => {
      const publishedRecipeCount = counts.get(ingredient.id) ?? 0;
      const publicState = classifyIngredientPublicSeoState(publishedRecipeCount);
      return {
        name: ingredient.name,
        slug: ingredient.slug,
        publishedRecipeCount,
        publicState,
        indexable: publicState === "INDEXABLE",
      };
    });

    rows.sort((a, b) => {
      if (b.publishedRecipeCount !== a.publishedRecipeCount) {
        return b.publishedRecipeCount - a.publishedRecipeCount;
      }
      return a.name.localeCompare(b.name);
    });
    return rows;
  } catch {
    return [];
  }
}

export function formatIngredientSeoReadinessReport(
  rows: IngredientSeoReadinessRow[],
): string {
  const lines = [
    "Ingredient SEO readiness (Published Recipes only)",
    "NAME\tSLUG\tPUBLISHED\tPUBLIC_STATE\tINDEXABLE",
  ];
  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.slug,
        String(row.publishedRecipeCount),
        row.publicState,
        row.indexable ? "YES" : "NO",
      ].join("\t"),
    );
  }
  lines.push("");
  lines.push(
    `Indexable threshold: ${INGREDIENT_INDEXABLE_MIN_RECIPES} distinct Published Recipes`,
  );
  lines.push(`Total Ingredients: ${rows.length}`);
  lines.push(`Indexable: ${rows.filter((row) => row.indexable).length}`);
  return lines.join("\n");
}

/**
 * Batch distinct Published Recipe counts for Admin Ingredient pages.
 */
export async function loadPublishedRecipeCountsByIngredientIds(
  db: DbClient,
  ingredientIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(ingredientIds.filter(Boolean))];
  if (!ids.length) return out;
  try {
    const rows = await db.recipeIngredient.findMany({
      where: {
        ingredientId: { in: ids },
        recipe: { status: "published" },
      },
      distinct: ["ingredientId", "recipeId"],
      select: { ingredientId: true },
    });
    for (const row of rows) {
      if (!row.ingredientId) continue;
      out.set(row.ingredientId, (out.get(row.ingredientId) ?? 0) + 1);
    }
  } catch {
    return out;
  }
  return out;
}
