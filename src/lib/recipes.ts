import { categories as staticCategories } from "@/data/categories";
import { recipes as staticRecipes } from "@/data/recipes";
import type { Category, Recipe } from "@/data/types";
import { dbAvailable, getDb } from "@/lib/db";
import { ensureRecipeTypeCorrections } from "@/lib/ensure-recipe-type-corrections";
import { ensureRecipeOverviewFields } from "@/lib/recipe-overview";
import { toPublicCategory, toPublicRecipe } from "@/lib/recipe-map";

export type PublicRecipe = Recipe & { extras?: { key: string; label: string; kind: string; value: unknown }[] };

function sortRecipes(list: PublicRecipe[]) {
  return [...list].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

async function loadFromDb(): Promise<PublicRecipe[] | null> {
  if (!(await dbAvailable())) return null;
  await ensureRecipeOverviewFields();
  await ensureRecipeTypeCorrections();
  const db = getDb();
  const count = await db.recipe.count({ where: { status: "published" } });
  if (count === 0) return null;

  const rows = await db.recipe.findMany({
    where: { status: "published" },
    include: {
      categories: { include: { category: true } },
      type: { include: { fields: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((row) => toPublicRecipe(row));
}

export async function getAllRecipes(): Promise<PublicRecipe[]> {
  return (await loadFromDb()) ?? sortRecipes(staticRecipes);
}

export async function getRecipeBySlug(slug: string): Promise<PublicRecipe | undefined> {
  const recipes = await getAllRecipes();
  return recipes.find((recipe) => recipe.slug === slug);
}

export async function getAllCategories(): Promise<Category[]> {
  if (await dbAvailable()) {
    const rows = await getDb().category.findMany({ orderBy: { name: "asc" } });
    if (rows.length) return rows.map(toPublicCategory);
  }
  return staticCategories;
}

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  const list = await getAllCategories();
  return list.find((category) => category.slug === slug);
}

export async function getRecipesByCategory(slug: string): Promise<PublicRecipe[]> {
  const recipes = await getAllRecipes();
  return recipes.filter((recipe) => recipe.categories.includes(slug));
}

export async function getFeaturedRecipes(limit = 4): Promise<PublicRecipe[]> {
  return (await getAllRecipes()).filter((recipe) => recipe.featured).slice(0, limit);
}

export async function getSeasonalRecipes(limit = 4): Promise<PublicRecipe[]> {
  return (await getAllRecipes()).filter((recipe) => recipe.seasonal).slice(0, limit);
}

export async function getRelatedRecipes(recipe: Recipe, limit = 3): Promise<PublicRecipe[]> {
  const scored = (await getAllRecipes())
    .filter((item) => item.slug !== recipe.slug)
    .map((item) => {
      const sharedCategories = item.categories.filter((category) =>
        recipe.categories.includes(category),
      ).length;
      const sharedTags = item.tags.filter((tag) => recipe.tags.includes(tag)).length;
      return { item, score: sharedCategories * 2 + sharedTags };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.item);
}

export { bakeMinutes, difficultyLabel, filterRecipes, formatTime, isoDuration, restMinutes, totalMinutes } from "@/lib/recipe-utils";
