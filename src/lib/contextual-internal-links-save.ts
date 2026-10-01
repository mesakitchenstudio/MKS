/**
 * Roadmap #11 — Server-side save policy for contextualInternalLinks.
 *
 * Gate OFF: previous field is authoritative (ignore client mutation).
 * Gate ON: validate new targets; retain previously accepted unavailable IDs.
 * Never write empty arrays.
 */

import {
  CONTEXTUAL_INTERNAL_LINK_MAX,
  getContextualInternalLinkIds,
  isPublishedRecipeStatus,
  normalizeContextualInternalLinks,
  withContextualInternalLinks,
} from "@/lib/contextual-internal-links";

export type ContextualInternalLinkTargetInfo = {
  exists: boolean;
  status?: string | null;
};

export type ApplyContextualInternalLinksOnSaveResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; error: string; values: Record<string, unknown> };

/**
 * Merge/validate contextualInternalLinks for Recipe save.
 *
 * `submittedRaw` is the editor-submitted field (JSON array or omitted).
 * When `featureEnabled` is false, previous links are restored and `submittedRaw` is ignored.
 */
export function applyContextualInternalLinksOnSave(input: {
  previousValues: Record<string, unknown> | null | undefined;
  nextValues: Record<string, unknown>;
  submittedRaw: unknown;
  sourceRecipeId: string;
  featureEnabled: boolean;
  /** Lookup for each submitted recipeId (missing key ⇒ treat as missing). */
  resolveTarget: (recipeId: string) => ContextualInternalLinkTargetInfo;
}): ApplyContextualInternalLinksOnSaveResult {
  const previous = input.previousValues ?? {};
  const sourceId = String(input.sourceRecipeId ?? "").trim();
  let next: Record<string, unknown> = { ...input.nextValues };

  // Always strip any accidental client-injected field before policy.
  delete next.contextualInternalLinks;

  if (!input.featureEnabled) {
    const preserved = normalizeContextualInternalLinks(
      previous.contextualInternalLinks,
      sourceId,
    );
    if (preserved) {
      next = { ...next, contextualInternalLinks: preserved };
    }
    return { ok: true, values: next };
  }

  const previousIds = new Set(getContextualInternalLinkIds(previous, sourceId));
  const submitted = normalizeContextualInternalLinks(input.submittedRaw, sourceId);

  if (!submitted) {
    // Explicit clear or historical absence — omit field.
    return { ok: true, values: next };
  }

  for (const { recipeId } of submitted) {
    const wasPreviouslyAccepted = previousIds.has(recipeId);
    const target = input.resolveTarget(recipeId);

    if (wasPreviouslyAccepted) {
      // Retain even if Draft/missing — editorial history.
      continue;
    }

    if (!target.exists) {
      return {
        ok: false,
        error: "One or more internal link targets no longer exist.",
        values: next,
      };
    }
    if (!isPublishedRecipeStatus(target.status)) {
      return {
        ok: false,
        error: "Internal links can only add Published recipes.",
        values: next,
      };
    }
  }

  next = withContextualInternalLinks(next, submitted, sourceId);
  return { ok: true, values: next };
}

export { CONTEXTUAL_INTERNAL_LINK_MAX };
