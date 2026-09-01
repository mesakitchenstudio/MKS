import { slugify } from "@/lib/fields";

/** Stable URL hash / DOM id for a recipe editor field, e.g. `#field-holiday`. */
export function recipeFieldAnchorId(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1-$2");
  return `field-${slugify(spaced)}`;
}
