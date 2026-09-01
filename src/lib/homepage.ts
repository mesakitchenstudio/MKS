import type { HomepageConfig } from "@/data/homepage";
import { homepageConfig } from "@/data/homepage";
import type { Recipe } from "@/data/types";
import { homepageEligibleRecipes } from "@/lib/homepage-eligibility";

export type ResolvedHomepage = {
  hero: Recipe | null;
  heroEyebrow: string;
  latest: Recipe[];
};

export type ResolveHomepageOptions = {
  config?: HomepageConfig;
  /** Admin-selected featured slug (SiteSetting); empty string clears selection. */
  featuredRecipeSlug?: string | null;
  now?: Date;
};

function recipeUpdatedMs(recipe: Recipe) {
  const stamp = recipe.updatedAt || recipe.publishedAt;
  const ms = Date.parse(stamp);
  return Number.isFinite(ms) ? ms : 0;
}

function sortHomepageRecipes(recipes: Recipe[]) {
  return [...recipes].sort((a, b) => {
    const pubDiff = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    if (pubDiff !== 0) return pubDiff;
    return recipeUpdatedMs(b) - recipeUpdatedMs(a);
  });
}

function pickFeaturedHero(
  eligible: Recipe[],
  featuredSlug: string | null | undefined,
  configSlug: string | undefined,
): Recipe | null {
  const candidates = [featuredSlug, configSlug].filter(
    (slug): slug is string => typeof slug === "string" && slug.trim().length > 0,
  );

  for (const slug of candidates) {
    const match = eligible.find((recipe) => recipe.slug === slug);
    if (match) return match;
  }

  return eligible[0] ?? null;
}

/**
 * Homepage recipe modules: one editorial hero + latest eligible grid.
 * Collection rows are not resolved here — /recipes keeps collection URL maps separately.
 */
export function resolveHomepage(
  recipes: Recipe[],
  options: ResolveHomepageOptions = {},
): ResolvedHomepage {
  const config = options.config ?? homepageConfig;
  const eligible = sortHomepageRecipes(homepageEligibleRecipes(recipes));

  const hero = pickFeaturedHero(
    eligible,
    options.featuredRecipeSlug,
    config.hero.recipeSlug,
  );

  let latest: Recipe[] = [];
  if (config.latest.enabled) {
    latest = eligible.filter((recipe) => recipe.slug !== hero?.slug).slice(0, config.latest.limit);
  }

  return {
    hero,
    heroEyebrow: config.hero.eyebrow,
    latest,
  };
}

/** Future collections can call this to exclude hero/latest/module duplicates. */
export function excludeHomepageSlugs(
  recipes: Recipe[],
  used: { hero?: Recipe | null; latest?: Recipe[]; extra?: string[] },
): Recipe[] {
  const blocked = new Set<string>();
  if (used.hero) blocked.add(used.hero.slug);
  for (const recipe of used.latest ?? []) blocked.add(recipe.slug);
  for (const slug of used.extra ?? []) blocked.add(slug);
  return recipes.filter((recipe) => !blocked.has(recipe.slug));
}
