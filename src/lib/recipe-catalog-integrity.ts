import { normalizeRecipeImageSrc } from "@/lib/recipe-images";
import { totalMinutes } from "@/lib/recipe-utils";
import type { Recipe } from "@/data/types";
import type { RecipeWithExtras } from "@/lib/recipe-timing";

/**
 * Public cards use totalMinutes: prep + counted heat (max bake/cook) + passive rest/proof.
 * See RecipeGridCard and recipe-utils.totalMinutes.
 */
export const CARD_TIME_SEMANTIC = "total" as const;

export function cardDisplayMinutes(recipe: Recipe | RecipeWithExtras): number {
  return totalMinutes(recipe);
}

/** Host patterns aligned with next.config images.remotePatterns. */
const RECOGNIZED_PUBLIC_IMAGE_PATTERNS: RegExp[] = [
  /^https:\/\/images\.unsplash\.com\//i,
  /^https:\/\/i\.ytimg\.com\//i,
  /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//i,
  /^https:\/\/[^/]+\.blob\.vercel-storage\.com\//i,
  /^\/[^/]/,
];

export function isRecognizedPublicRecipeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return RECOGNIZED_PUBLIC_IMAGE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isLikelyExternalStockImageUrl(url: string): boolean {
  return /images\.unsplash\.com/i.test(url.trim());
}

/**
 * Non-blocking publish warnings — does not replace validateRecipeForPublish.
 * Drafts may omit media; published recipes already require hero image + alt.
 */
export function listPublishContentWarnings(input: {
  values: Record<string, unknown>;
}): string[] {
  const warnings: string[] = [];
  const normalized = normalizeRecipeImageSrc(String(input.values.image ?? ""));
  const rawImage = String(input.values.image ?? "").trim();

  if (!normalized) {
    warnings.push(
      "No hero image — public recipe cards will show the Mesa placeholder until one is added.",
    );
  } else if (!isRecognizedPublicRecipeImageUrl(rawImage)) {
    warnings.push(
      "Hero image URL may not load on the public site. Upload an image or use an allowed host.",
    );
  } else if (isLikelyExternalStockImageUrl(rawImage)) {
    warnings.push(
      "Hero image is external stock photography. Confirm it shows this exact recipe before publishing.",
    );
  }

  const prep = input.values.prepMinutes;
  if (typeof prep !== "number" || Number.isNaN(prep)) {
    warnings.push("Preparation time is missing — cards will show 0 min in the timing line.");
  }

  const servings = input.values.servings;
  if (typeof servings !== "number" || Number.isNaN(servings) || servings <= 0) {
    warnings.push("Yield is missing — cards will show an incomplete servings line.");
  }

  return warnings;
}
