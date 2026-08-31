import type { RecipeSeriesLink } from "@/lib/series-types";

/** Collapse "Breads" / "Bread" / "breads" style duplicates for comparison. */
export function taxonomyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/s$/, "");
}

function seriesDisplayName(link: RecipeSeriesLink) {
  return (link.shortTitle || link.title || "").trim();
}

function isRedundantSeriesName(
  link: RecipeSeriesLink,
  course: string,
  typeName?: string | null,
  categories: string[] = [],
) {
  const seriesKey = taxonomyKey(seriesDisplayName(link));
  const slugKey = taxonomyKey(link.slug.replace(/-/g, " "));
  if (!seriesKey && !slugKey) return true;

  const courseKey = taxonomyKey(course);
  const typeKey = typeName ? taxonomyKey(typeName) : "";
  const categoryKeys = categories.map((category) => taxonomyKey(category.replace(/-/g, " ")));

  const keys = [seriesKey, slugKey].filter(Boolean);
  for (const key of keys) {
    if (courseKey && key === courseKey) return true;
    if (typeKey && key === typeKey) return true;
    if (categoryKeys.some((categoryKey) => categoryKey && categoryKey === key)) return true;
  }
  return false;
}

/**
 * Hide hero "Part of …" when the series name only restates course/type/category
 * (e.g. Part of Breads above Bread). Keep meaningful named series.
 */
export function shouldShowHeroSeriesContext(
  links: RecipeSeriesLink[],
  course: string,
  typeName?: string | null,
  categories: string[] = [],
): boolean {
  return heroSeriesLinks(links, course, typeName, categories).length > 0;
}

/** Series links worth showing in the hero after redundancy filtering. */
export function heroSeriesLinks(
  links: RecipeSeriesLink[],
  course: string,
  typeName?: string | null,
  categories: string[] = [],
): RecipeSeriesLink[] {
  if (!links.length) return [];
  return links.filter((link) => !isRedundantSeriesName(link, course, typeName, categories));
}
