/**
 * Optional manual Related Recipe pins for the public “More from the studio” shelf.
 * Preserves the automatic scorer; pins only reorder/front-load when present.
 */

import { RELATED_RECIPE_SHELF_LIMIT } from "@/lib/recipe-related-shelf";

export const RELATED_RECIPE_MANUAL_MAX = RELATED_RECIPE_SHELF_LIMIT;

export function parseRelatedRecipeIds(raw: unknown): string[] {
  if (raw == null) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of parsed) {
    const id = String(item ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= RELATED_RECIPE_MANUAL_MAX) break;
  }
  return out;
}

export function serializeRelatedRecipeIds(ids: string[]): string {
  return JSON.stringify(parseRelatedRecipeIds(ids));
}
