import type { Recipe } from "@/data/types";
import { clampRecipeServings } from "@/lib/culinary-format";
import { site } from "@/data/site";
import { recipePublicPath } from "@/lib/redirects";
import { publicRestLabel, publicRestMinutes } from "@/lib/recipe-timing";
import {
  difficultyLabel,
  formatTime,
  heatTimingRing,
  totalMinutes,
} from "@/lib/recipe-utils";

export type RecipePrintMetaItem = { label: string; value: string };

/** Absolute canonical URL for the public recipe page. */
export function recipePrintCanonicalUrl(slug: string): string {
  const base = site.url.replace(/\/$/, "");
  return `${base}${recipePublicPath(slug)}`;
}

export function recipePrintYieldLabel(servings: number, unit: string): string {
  const n = clampRecipeServings(servings);
  const label = unit?.trim() || "servings";
  return `${n} ${label}`;
}

/**
 * Compact print metadata. Yield always uses the reader's selected servings
 * so it agrees with scaled ingredient amounts.
 */
export function recipePrintMetaItems(
  recipe: Recipe,
  selectedServings: number,
): RecipePrintMetaItem[] {
  const heat = heatTimingRing(recipe);
  const rest = publicRestMinutes(recipe);
  const restLabel = publicRestLabel(recipe);
  const total = totalMinutes(recipe);
  const yieldServings = clampRecipeServings(selectedServings);

  const items: RecipePrintMetaItem[] = [];
  if (recipe.prepMinutes > 0) {
    items.push({ label: "Prep", value: formatTime(recipe.prepMinutes) });
  }
  if (heat && heat.minutes > 0) {
    items.push({ label: heat.label, value: formatTime(heat.minutes) });
  }
  if (rest > 0) {
    items.push({ label: restLabel, value: formatTime(rest) });
  }
  if (total > 0) {
    items.push({ label: "Total", value: formatTime(total) });
  }
  items.push({
    label: "Yield",
    value: recipePrintYieldLabel(yieldServings, recipe.servingsUnit),
  });
  if (recipe.difficulty?.trim()) {
    items.push({ label: "Difficulty", value: difficultyLabel(recipe.difficulty) });
  }
  return items;
}
