import type { Recipe } from "@/data/types";

/**
 * Public dish identity shown under the course eyebrow when the H1 is a
 * topic/SEO title (common for YouTube-linked recipes).
 *
 * Prefers optional `dishName` from recipe values JSON (no schema change).
 * Falls back to type name when the title looks like a how-to topic.
 */
export function resolveRecipeDishIdentity(
  recipe: Pick<Recipe, "title" | "course" | "dishName" | "typeName" | "imageAlt">,
): string | null {
  const title = recipe.title.trim();
  const dishName = recipe.dishName?.trim() || "";
  if (dishName && !sameLabel(dishName, title)) return dishName;

  if (!looksLikeTopicTitle(title)) return null;

  const typeName = recipe.typeName?.trim() || "";
  if (
    typeName &&
    !sameLabel(typeName, title) &&
    !sameLabel(typeName, recipe.course) &&
    !isGenericTypeLabel(typeName, recipe.course)
  ) {
    return typeName;
  }

  const alt = recipe.imageAlt?.trim() || "";
  if (
    alt &&
    !sameLabel(alt, title) &&
    alt.length <= 72 &&
    !looksLikeTopicTitle(alt) &&
    !/^photo|image|picture of/i.test(alt)
  ) {
    return alt;
  }

  return null;
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
