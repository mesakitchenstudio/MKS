import type { Recipe } from "@/data/types";

/**
 * Public dish identity shown under the course eyebrow when the H1 is a
 * topic/SEO title (common for YouTube-linked recipes).
 *
 * Prefer explicit short dish fields. Never use image alt / captions.
 * If nothing trustworthy is available, return null and omit the line.
 */
export function resolveRecipeDishIdentity(
  recipe: Pick<Recipe, "title" | "course" | "dishName" | "typeName"> & {
    seriesItemTitles?: string[];
  },
): string | null {
  const title = recipe.title.trim();

  const dishName = recipe.dishName?.trim() || "";
  if (dishName && !sameLabel(dishName, title) && isTrustworthyDishLabel(dishName)) {
    return dishName;
  }

  for (const candidate of recipe.seriesItemTitles ?? []) {
    const value = candidate.trim();
    if (value && !sameLabel(value, title) && isTrustworthyDishLabel(value)) {
      return value;
    }
  }

  if (!looksLikeTopicTitle(title)) return null;

  const typeName = recipe.typeName?.trim() || "";
  if (
    typeName &&
    !sameLabel(typeName, title) &&
    !sameLabel(typeName, recipe.course) &&
    !isGenericTypeLabel(typeName, recipe.course) &&
    isTrustworthyDishLabel(typeName)
  ) {
    return typeName;
  }

  return null;
}

/** Reject image-alt sentences and other non-name strings. */
export function isTrustworthyDishLabel(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (/[.!?]/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8) return false;
  if (
    /\b(resting|lined|basket|photograph|photo|image|picture|caption|sitting|placed|arranged|wooden|marble|counter)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  if (/^(a|an|the)\s+\w+\s+\w+\s+\w+/i.test(text) && words.length >= 6) return false;
  return true;
}

function sameLabel(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isGenericTypeLabel(typeName: string, course: string) {
  const type = typeName.trim().toLowerCase();
  const courseLabel = course.trim().toLowerCase();
  if (!type || !courseLabel) return false;
  if (courseLabel === type || courseLabel === `${type}s` || type === `${courseLabel}s`) return true;
  if (courseLabel.replace(/s$/, "") === type.replace(/s$/, "")) return true;
  return false;
}

/** Titles that read as video/search topics rather than dish names. */
export function looksLikeTopicTitle(title: string) {
  const value = title.trim();
  if (!value) return false;
  if (/[?]/.test(value)) return true;
  if (/^\s*(why|how|what|when|the secret|tips? for)\b/i.test(value)) return true;
  if (/\((and|&)\s+how\b/i.test(value)) return true;
  return false;
}

/**
 * Catalog / grid card heading. Prefer an editorial `dishName` when present and
 * trustworthy; otherwise keep the canonical `title` (SEO / YouTube / admin).
 * Does not invent names from type, series, or video titles.
 */
export function resolveRecipeCardTitle(
  recipe: Pick<Recipe, "title" | "dishName">,
): string {
  const title = recipe.title.trim();
  const dishName = recipe.dishName?.trim() || "";
  if (dishName && isTrustworthyDishLabel(dishName)) return dishName;
  return title;
}
