import type { Recipe } from "@/data/types";
import {
  isRecognizedPublicRecipeImageUrl,
  listPublishContentWarnings,
} from "@/lib/recipe-catalog-integrity";
import { normalizeRecipeImageSrc, RECIPE_IMAGE_FALLBACK } from "@/lib/recipe-images";

export type HomepageEligibilityAuditRow = {
  slug: string;
  title: string;
  published: boolean;
  imageExists: boolean;
  imageHost: string;
  integrityWarnings: string[];
  hardEligible: boolean;
  softWarnings: string[];
  exclusionReasons: string[];
};

function recipeWarningValues(recipe: Recipe): Record<string, unknown> {
  return {
    image: recipe.image,
    prepMinutes: recipe.prepMinutes,
    servings: recipe.servings,
  };
}

function softWarningsForRecipe(recipe: Recipe): string[] {
  const warnings = listPublishContentWarnings({ values: recipeWarningValues(recipe) });
  return warnings.filter((warning) => {
    if (warning.includes("No hero image")) return false;
    if (warning.includes("may not load on the public site")) return false;
    return true;
  });
}

function imageHostLabel(image: string): string {
  const trimmed = image.trim();
  if (!trimmed) return "—";
  if (trimmed === RECIPE_IMAGE_FALLBACK) return "mesa-fallback";
  if (/images\.unsplash\.com/i.test(trimmed)) return "unsplash";
  if (/i\.ytimg\.com/i.test(trimmed)) return "youtube";
  if (/vercel-storage\.com/i.test(trimmed)) return "vercel-blob";
  if (trimmed.startsWith("/")) return "local";
  try {
    return new URL(trimmed).hostname;
  } catch {
    return "unknown";
  }
}

export function assessHomepageRecipeEligibility(recipe: Recipe): {
  hardEligible: boolean;
  hardBlockers: string[];
  softWarnings: string[];
} {
  const hardBlockers: string[] = [];
  const rawImage = String(recipe.image ?? "").trim();
  const normalized = normalizeRecipeImageSrc(recipe.image);

  if ("status" in recipe && recipe.status === "draft") {
    hardBlockers.push("unpublished");
  }
  if (!recipe.slug?.trim()) hardBlockers.push("missing slug");
  if (!recipe.title?.trim()) hardBlockers.push("missing title");
  if (!recipe.excerpt?.trim()) hardBlockers.push("missing excerpt");
  if (!normalized) hardBlockers.push("missing image");
  if (normalized === RECIPE_IMAGE_FALLBACK) hardBlockers.push("mesa fallback image");
  if (rawImage && !isRecognizedPublicRecipeImageUrl(rawImage)) {
    hardBlockers.push("unrecognized image host");
  }
  if (!String(recipe.imageAlt ?? "").trim()) {
    hardBlockers.push("missing image alt");
  }

  const softWarnings = softWarningsForRecipe(recipe);

  return {
    hardEligible: hardBlockers.length === 0,
    hardBlockers,
    softWarnings,
  };
}

export function isHomepageEligibleRecipe(recipe: Recipe): boolean {
  return assessHomepageRecipeEligibility(recipe).hardEligible;
}

export function homepageEligibleRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.filter(isHomepageEligibleRecipe);
}

export function auditHomepageRecipeEligibility(recipes: Recipe[]): HomepageEligibilityAuditRow[] {
  return recipes.map((recipe) => {
    const assessment = assessHomepageRecipeEligibility(recipe);
    const rawImage = String(recipe.image ?? "").trim();
    const integrityWarnings = listPublishContentWarnings({ values: recipeWarningValues(recipe) });
    return {
      slug: recipe.slug,
      title: recipe.title,
      published: !("status" in recipe && recipe.status === "draft"),
      imageExists: Boolean(rawImage),
      imageHost: imageHostLabel(rawImage),
      integrityWarnings,
      hardEligible: assessment.hardEligible,
      softWarnings: assessment.softWarnings,
      exclusionReasons: assessment.hardBlockers,
    };
  });
}

/** @deprecated Use assessHomepageRecipeEligibility — stock/Unsplash is a soft warning only. */
export function isHomepageStockImageOnlyBlocked(): boolean {
  return false;
}
