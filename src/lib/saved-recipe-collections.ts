/**
 * Phase 4A — Member Saved Collections (private).
 * Organizes RecipeSave rows; does not replace Favorites / RecipeSave.
 * Distinct from public editorial Collections (Series).
 */

export const SAVED_RECIPE_COLLECTION_NAME_MAX = 80;
/** Abuse/sanity cap — not a monetization limit. */
export const SAVED_RECIPE_COLLECTIONS_MAX_PER_MEMBER = 50;

export const SAVED_RECIPE_COLLECTION_ERRORS = [
  "UNAUTHORIZED",
  "NOT_FOUND",
  "INVALID_NAME",
  "DUPLICATE_NAME",
  "COLLECTION_LIMIT",
  "NOT_SAVED",
  "ALREADY_IN_COLLECTION",
  "FORBIDDEN",
] as const;

export type SavedRecipeCollectionError = (typeof SAVED_RECIPE_COLLECTION_ERRORS)[number];

export type SavedRecipeCollectionActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: SavedRecipeCollectionError; message: string };

export function normalizeSavedRecipeCollectionName(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSavedRecipeCollectionNameKey(raw: unknown): string {
  return normalizeSavedRecipeCollectionName(raw).toLowerCase();
}

export function validateSavedRecipeCollectionName(
  raw: unknown,
): { ok: true; name: string; nameNorm: string } | { ok: false; error: "INVALID_NAME"; message: string } {
  const name = normalizeSavedRecipeCollectionName(raw);
  if (!name) {
    return { ok: false, error: "INVALID_NAME", message: "Enter a collection name." };
  }
  if (name.length > SAVED_RECIPE_COLLECTION_NAME_MAX) {
    return {
      ok: false,
      error: "INVALID_NAME",
      message: `Use ${SAVED_RECIPE_COLLECTION_NAME_MAX} characters or fewer.`,
    };
  }
  // Plain text only — reject control chars and angle brackets (no HTML).
  if (/[\u0000-\u001F\u007F<>]/.test(name)) {
    return { ok: false, error: "INVALID_NAME", message: "Use a plain text name." };
  }
  return { ok: true, name, nameNorm: normalizeSavedRecipeCollectionNameKey(name) };
}

export function collectionRecipeCountLabel(count: number): string {
  return count === 1 ? "1 recipe" : `${count} recipes`;
}

export type MemberCollectionSummary = {
  id: string;
  name: string;
  /** Visible published recipes only — never hints at drafts/orphans. */
  visibleCount: number;
  updatedAt: string;
};

/** Lazy picker payload — private to the signed-in member. */
export type RecipeCollectionPickerState = {
  recipeSaveId: string;
  membershipCount: number;
  collections: {
    id: string;
    name: string;
    selected: boolean;
  }[];
};

/** Ordering: collections by updatedAt desc; items by createdAt desc (most recently added). */
export const SAVED_RECIPE_COLLECTION_LIST_ORDER = "updatedAt_desc" as const;
export const SAVED_RECIPE_COLLECTION_ITEM_ORDER = "createdAt_desc" as const;

/** Dedupe + clip collection ids for membership sync (max = per-member limit). */
export function normalizeCollectionIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const id = String(item ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= SAVED_RECIPE_COLLECTIONS_MAX_PER_MEMBER) break;
  }
  return out;
}
