import type { HomepageConfig } from "@/data/homepage";
import { homepageConfig } from "@/data/homepage";
import type { Recipe } from "@/data/types";
import { homepageEligibleRecipes } from "@/lib/homepage-eligibility";

export type ResolvedHomepage = {
  hero: Recipe | null;
  heroEyebrow: string;
  latest: Recipe[];
  fromKitchen: Recipe[];
};

export type ResolveHomepageOptions = {
  config?: HomepageConfig;
  /** Admin-selected featured slug (SiteSetting); empty string clears selection. */
  featuredRecipeSlug?: string | null;
  /** Up to three admin-selected slugs for the From the kitchen row. */
  fromKitchenSlugs?: string[];
  now?: Date;
};

const LATEST_MIN_VISIBLE = 3;
const LATEST_MAX = 4;
const FROM_KITCHEN_REQUIRED = 3;

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

function pickBySlug(eligible: Recipe[], slug: string | null | undefined): Recipe | null {
  if (!slug?.trim()) return null;
  return eligible.find((recipe) => recipe.slug === slug) ?? null;
}

function pickFromKitchen(
  eligible: Recipe[],
  configuredSlugs: string[],
  used: Set<string>,
): Recipe[] {
  const picked: Recipe[] = [];
  for (const slug of configuredSlugs) {
    if (picked.length >= FROM_KITCHEN_REQUIRED) break;
    if (used.has(slug)) continue;
    const match = eligible.find((recipe) => recipe.slug === slug);
    if (!match) continue;
    picked.push(match);
    used.add(match.slug);
  }
  return picked.length === FROM_KITCHEN_REQUIRED ? picked : [];
}

/**
 * Homepage recipe modules: hero, latest, and optional From the kitchen row.
 * Legacy automatic collection rows are not resolved here.
 */
export function resolveHomepage(
  recipes: Recipe[],
  options: ResolveHomepageOptions = {},
): ResolvedHomepage {
  const config = options.config ?? homepageConfig;
  const eligible = sortHomepageRecipes(homepageEligibleRecipes(recipes));
  const used = new Set<string>();

  let hero: Recipe | null = pickBySlug(eligible, options.featuredRecipeSlug);
  if (!hero) {
    hero = eligible.find((recipe) => !used.has(recipe.slug)) ?? null;
  }
  if (hero) used.add(hero.slug);

  let latest: Recipe[] = [];
  if (config.latest.enabled) {
    const pool = eligible.filter((recipe) => !used.has(recipe.slug));
    if (pool.length >= LATEST_MIN_VISIBLE) {
      latest = pool.slice(0, LATEST_MAX);
      for (const recipe of latest) used.add(recipe.slug);
    }
  }

  let fromKitchen: Recipe[] = [];
  if (config.fromKitchen.enabled) {
    fromKitchen = pickFromKitchen(eligible, options.fromKitchenSlugs ?? [], used);
  }

  return {
    hero,
    heroEyebrow: config.hero.eyebrow,
    latest,
    fromKitchen,
  };
}

/** Deterministic slug list of every recipe shown in homepage editorial modules. */
export function homepageUsedRecipeSlugs(resolved: ResolvedHomepage): string[] {
  const slugs: string[] = [];
  if (resolved.hero) slugs.push(resolved.hero.slug);
  for (const recipe of resolved.latest) slugs.push(recipe.slug);
  for (const recipe of resolved.fromKitchen) slugs.push(recipe.slug);
  return slugs;
}

/** Future collections can call this to exclude hero/latest/module duplicates. */
export function excludeHomepageSlugs(
  recipes: Recipe[],
  used: { hero?: Recipe | null; latest?: Recipe[]; fromKitchen?: Recipe[]; extra?: string[] },
): Recipe[] {
  const blocked = new Set<string>();
  if (used.hero) blocked.add(used.hero.slug);
  for (const recipe of used.latest ?? []) blocked.add(recipe.slug);
  for (const recipe of used.fromKitchen ?? []) blocked.add(recipe.slug);
  for (const slug of used.extra ?? []) blocked.add(slug);
  return recipes.filter((recipe) => !blocked.has(recipe.slug));
}

export function summarizeHomepageCandidates(
  recipes: Recipe[],
  options: ResolveHomepageOptions = {},
): {
  hardEligibleCount: number;
  heroCandidates: string[];
  latestCandidates: string[];
  fromKitchenCandidates: string[];
  resolved: ResolvedHomepage;
} {
  const eligible = sortHomepageRecipes(homepageEligibleRecipes(recipes));
  const resolved = resolveHomepage(recipes, options);
  const heroSlug = resolved.hero?.slug;
  const latestPool = eligible.filter((recipe) => recipe.slug !== heroSlug);
  const latestUsed = new Set(resolved.latest.map((recipe) => recipe.slug));
  const kitchenPool = eligible.filter(
    (recipe) => recipe.slug !== heroSlug && !latestUsed.has(recipe.slug),
  );

  return {
    hardEligibleCount: eligible.length,
    heroCandidates: eligible.map((recipe) => recipe.title),
    latestCandidates: latestPool.map((recipe) => recipe.title),
    fromKitchenCandidates: kitchenPool.map((recipe) => recipe.title),
    resolved,
  };
}
