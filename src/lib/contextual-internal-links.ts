/**
 * Roadmap #11 — Accepted contextual internal Recipe links.
 *
 * Persisted in Recipe.values as optional `contextualInternalLinks`.
 * Absence (missing field) is the canonical empty state — never write `[]`.
 * Stable identity only: `{ recipeId }`. Titles/slugs/hrefs/scores are derived.
 */

/** Max accepted contextual links per Recipe (editorial + public). */
export const CONTEXTUAL_INTERNAL_LINK_MAX = 3;

export type ContextualInternalLink = {
  recipeId: string;
};

export type ContextualInternalLinkAcceptDenial =
  | "blank"
  | "self"
  | "duplicate"
  | "max"
  | "not_published"
  | "missing_target";

export type ContextualInternalLinkAcceptResult =
  | { ok: true }
  | { ok: false; reason: ContextualInternalLinkAcceptDenial };

/** Recipe.status values that may be accepted / shown publicly. */
export function isPublishedRecipeStatus(status: unknown): boolean {
  return String(status ?? "")
    .trim()
    .toLowerCase() === "published";
}

/**
 * Normalize accepted contextual links from Recipe.values (or raw input).
 * Returns `undefined` when empty so callers can omit the field (no `[]` churn).
 */
export function normalizeContextualInternalLinks(
  value: unknown,
  sourceRecipeId?: string,
): ContextualInternalLink[] | undefined {
  if (value == null) return undefined;

  let parsed: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(parsed)) return undefined;

  const selfId = String(sourceRecipeId ?? "").trim();
  const seen = new Set<string>();
  const out: ContextualInternalLink[] = [];

  for (const entry of parsed) {
    let recipeId = "";
    if (typeof entry === "string") {
      recipeId = entry.trim();
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      recipeId = String((entry as { recipeId?: unknown }).recipeId ?? "").trim();
    }
    if (!recipeId) continue;
    if (selfId && recipeId === selfId) continue;
    if (seen.has(recipeId)) continue;
    seen.add(recipeId);
    out.push({ recipeId });
    if (out.length >= CONTEXTUAL_INTERNAL_LINK_MAX) break;
  }

  return out.length > 0 ? out : undefined;
}

/** Ordered accepted Recipe IDs (max 3). Missing/empty → []. */
export function getContextualInternalLinkIds(
  values: Record<string, unknown> | null | undefined,
  sourceRecipeId?: string,
): string[] {
  if (!values || typeof values !== "object") return [];
  const normalized = normalizeContextualInternalLinks(
    values.contextualInternalLinks,
    sourceRecipeId,
  );
  return normalized?.map((item) => item.recipeId) ?? [];
}

/**
 * Apply accepted links onto a values object without writing empty arrays.
 * Cleared / all-invalid → field deleted.
 */
export function withContextualInternalLinks(
  values: Record<string, unknown>,
  raw: unknown,
  sourceRecipeId?: string,
): Record<string, unknown> {
  const next = { ...values };
  const normalized = normalizeContextualInternalLinks(raw, sourceRecipeId);
  if (!normalized) {
    delete next.contextualInternalLinks;
  } else {
    next.contextualInternalLinks = normalized;
  }
  return next;
}

/**
 * Domain eligibility for Accept / manual add (11C will enforce on the server).
 * Manual targets do NOT need a recommendation score ≥ threshold.
 */
export function canAcceptContextualInternalLink(input: {
  sourceRecipeId: string;
  targetRecipeId: string | null | undefined;
  /** When false, target row is missing. When omitted, existence is assumed. */
  targetExists?: boolean;
  targetStatus?: unknown;
  existingIds?: readonly string[];
}): ContextualInternalLinkAcceptResult {
  const sourceId = String(input.sourceRecipeId ?? "").trim();
  const targetId = String(input.targetRecipeId ?? "").trim();
  if (!targetId) return { ok: false, reason: "blank" };
  if (input.targetExists === false) return { ok: false, reason: "missing_target" };
  if (sourceId && targetId === sourceId) return { ok: false, reason: "self" };
  if (!isPublishedRecipeStatus(input.targetStatus)) {
    return { ok: false, reason: "not_published" };
  }

  const existing = normalizeContextualInternalLinks(
    (input.existingIds ?? []).map((id) => ({ recipeId: id })),
    sourceId,
  );
  const ids = existing?.map((item) => item.recipeId) ?? [];
  if (ids.includes(targetId)) return { ok: false, reason: "duplicate" };
  if (ids.length >= CONTEXTUAL_INTERNAL_LINK_MAX) return { ok: false, reason: "max" };
  return { ok: true };
}

/** Public renderer eligibility: Published only. Draft/missing → hide, keep stored ID. */
export function isContextualInternalLinkPubliclyEligible(input: {
  targetExists: boolean;
  targetStatus: unknown;
}): boolean {
  if (!input.targetExists) return false;
  return isPublishedRecipeStatus(input.targetStatus);
}
