import type { RecipeSeriesLink } from "@/lib/series-types";

/** Collapse "Breads" / "Bread" style duplicates for comparison. */
function taxonomyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/s$/, "");
}

/**
 * Hide hero "Part of …" when the series name only restates course/type
 * (e.g. Part of Breads above Bread). Keep meaningful named series.
 */
export function shouldShowHeroSeriesContext(
  links: RecipeSeriesLink[],
  course: string,
  typeName?: string | null,
): boolean {
  if (!links.length) return false;

  const courseKey = taxonomyKey(course);
  const typeKey = typeName ? taxonomyKey(typeName) : "";

  return links.some((link) => {
    const seriesKey = taxonomyKey(link.shortTitle || link.title);
    if (!seriesKey) return false;
    if (courseKey && seriesKey === courseKey) return false;
    if (typeKey && seriesKey === typeKey) return false;
    return true;
  });
}

/** Series links worth showing in the hero after redundancy filtering. */
export function heroSeriesLinks(
  links: RecipeSeriesLink[],
  course: string,
  typeName?: string | null,
): RecipeSeriesLink[] {
  if (!shouldShowHeroSeriesContext(links, course, typeName)) return [];

  const courseKey = taxonomyKey(course);
  const typeKey = typeName ? taxonomyKey(typeName) : "";

  return links.filter((link) => {
    const seriesKey = taxonomyKey(link.shortTitle || link.title);
    if (!seriesKey) return false;
    if (courseKey && seriesKey === courseKey) return false;
    if (typeKey && seriesKey === typeKey) return false;
    return true;
  });
}
