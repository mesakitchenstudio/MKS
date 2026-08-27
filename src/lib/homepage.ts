import type { HomepageCollectionConfig, HomepageConfig } from "@/data/homepage";
import { homepageConfig } from "@/data/homepage";
import type { Recipe } from "@/data/types";

export type ResolvedHomepageCollection = HomepageCollectionConfig & {
  recipes: Recipe[];
};

export type ResolvedHomepage = {
  hero: Recipe | null;
  heroEyebrow: string;
  latest: Recipe[];
  collections: ResolvedHomepageCollection[];
};

function recipeMap(recipes: Recipe[]) {
  return new Map(recipes.map((recipe) => [recipe.slug, recipe]));
}

function pickRecipes(map: Map<string, Recipe>, slugs: string[], limit?: number) {
  const picked: Recipe[] = [];
  for (const slug of slugs) {
    const recipe = map.get(slug);
    if (recipe) picked.push(recipe);
    if (limit && picked.length >= limit) break;
  }
  return picked;
}

function isWithinSeasonalWindow(window: HomepageCollectionConfig["seasonalWindow"], now = new Date()) {
  if (!window) return true;
  const year = now.getFullYear();
  const start = new Date(`${year}-${window.from}T12:00:00`);
  let end = new Date(`${year}-${window.to}T12:00:00`);
  const current = new Date(`${year}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T12:00:00`);
  if (end < start) {
    // Window wraps year end (e.g. Nov–Feb)
    return current >= start || current <= end;
  }
  return current >= start && current <= end;
}

export function resolveHomepage(
  recipes: Recipe[],
  config: HomepageConfig = homepageConfig,
  now = new Date(),
): ResolvedHomepage {
  const map = recipeMap(recipes);

  let hero: Recipe | null = null;
  if (config.hero.recipeSlug) {
    hero = map.get(config.hero.recipeSlug) ?? null;
  }
  if (!hero && config.latest.enabled) {
    hero = pickRecipes(map, config.latest.recipeSlugs, 1)[0] ?? null;
  }
  if (!hero) {
    hero = recipes.find((recipe) => recipe.featured) ?? recipes[0] ?? null;
  }

  let latest: Recipe[] = [];
  if (config.latest.enabled) {
    latest = pickRecipes(map, config.latest.recipeSlugs, config.latest.limit);
    if (!latest.length) {
      latest = recipes.filter((recipe) => recipe.featured).slice(0, config.latest.limit);
    }
    if (!latest.length) {
      latest = recipes.slice(0, config.latest.limit);
    }
  }

  const collections: ResolvedHomepageCollection[] = config.collections
    .filter((collection) => collection.enabled)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((collection) => isWithinSeasonalWindow(collection.seasonalWindow, now))
    .map((collection) => ({
      ...collection,
      recipes: pickRecipes(map, collection.recipeSlugs, 4),
    }))
    .filter((collection) => collection.recipes.length > 0);

  return {
    hero,
    heroEyebrow: config.hero.eyebrow,
    latest,
    collections,
  };
}
