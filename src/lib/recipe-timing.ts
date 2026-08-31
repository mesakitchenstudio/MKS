import type { Recipe } from "@/data/types";
import type { ExtraField } from "@/lib/recipe-map";

export type RecipeWithExtras = Recipe & { extras?: ExtraField[] };

export function riseHoursFromExtras(recipe: RecipeWithExtras): number {
  const row = recipe.extras?.find((field) => field.key === "riseHours");
  if (typeof row?.value !== "number" || !Number.isFinite(row.value) || row.value <= 0) {
    return 0;
  }
  return row.value;
}

/** True when riseHours and restMinutes describe the same proof/rest window. */
export function riseRestMinutesOverlap(recipe: RecipeWithExtras): boolean {
  const riseHours = riseHoursFromExtras(recipe);
  const rest = recipe.restMinutes ?? 0;
  if (riseHours <= 0 || rest <= 0) return false;
  const riseMinutes = riseHours * 60;
  return Math.abs(riseMinutes - rest) <= 5;
}

export function shouldHideRiseHoursExtra(recipe: RecipeWithExtras): boolean {
  return riseRestMinutesOverlap(recipe);
}

export function publicRestMinutes(recipe: RecipeWithExtras): number {
  const riseHours = riseHoursFromExtras(recipe);
  const rest = recipe.restMinutes ?? 0;
  if (riseHours > 0 && (rest <= 0 || riseRestMinutesOverlap(recipe))) {
    return riseHours * 60;
  }
  return rest;
}

export function publicRestLabel(recipe: RecipeWithExtras): string {
  const riseHours = riseHoursFromExtras(recipe);
  if (riseHours > 0 && (riseRestMinutesOverlap(recipe) || (recipe.restMinutes ?? 0) <= 0)) {
    return "Proofing";
  }
  return "Resting";
}

export function readerExtraLabel(label: string, key: string): string {
  if (key === "riseHours") return "Proofing time";
  return label;
}

export function visibleExtras(recipe: RecipeWithExtras): ExtraField[] {
  return (recipe.extras ?? []).filter((field) => {
    if (field.key === "riseHours" && shouldHideRiseHoursExtra(recipe)) return false;
    return true;
  });
}

export function publicExtrasForPage(recipe: RecipeWithExtras): ExtraField[] {
  return visibleExtras(recipe).filter((field) => {
    if (field.key === "riseHours" && shouldHideRiseHoursExtra(recipe)) return false;
    const key = field.key.toLowerCase();
    if (
      key.includes("proof") ||
      key.includes("rise") ||
      key.includes("rest") ||
      key.includes("ferment")
    ) {
      if (field.kind === "minutes" || field.kind === "number" || key.endsWith("hours")) {
        return false;
      }
    }
    return true;
  });
}
