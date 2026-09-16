/**
 * Roadmap #8D/#8F-R2 — durable first-ever Recipe publication detection.
 *
 * `publishedAt` alone is insufficient: unpublish clears it, so republish looks
 * like a first publish. Use editorial history (AdminAuditEvent / RecipeRevision)
 * captured before the current publish transition.
 *
 * Also recognizes explicit legacy safety markers created for Recipes that were
 * already public before follower-notification tracking (Roadmap #8).
 */

import { getDb } from "@/lib/db";

/** Editorial first-publish audit action. */
export const RECIPE_PUBLISHED_AUDIT_ACTION = "recipe.published" as const;

/**
 * Explicit historical safety marker — NOT a reconstructed publish event.
 * Means: Recipe was already public before follower-notification tracking.
 */
export const RECIPE_PUBLICATION_LEGACY_MARKER_ACTION =
  "recipe.publication_legacy_marker" as const;

export const RECIPE_PRIOR_PUBLICATION_AUDIT_ACTIONS = [
  RECIPE_PUBLISHED_AUDIT_ACTION,
  RECIPE_PUBLICATION_LEGACY_MARKER_ACTION,
] as const;

/** Whether this Recipe has ever been publicly published before the current transition. */
export async function recipeHadPriorPublication(recipeId: string): Promise<boolean> {
  const id = recipeId.trim();
  if (!id) return false;

  const db = getDb();
  const [audit, revision] = await Promise.all([
    db.adminAuditEvent.findFirst({
      where: {
        entityType: "recipe",
        entityId: id,
        action: { in: [...RECIPE_PRIOR_PUBLICATION_AUDIT_ACTIONS] },
      },
      select: { id: true },
    }),
    db.recipeRevision.findFirst({
      where: { stableRecipeId: id, reason: "published" },
      select: { id: true },
    }),
  ]);

  return Boolean(audit || revision);
}

export type FirstEverPublicationTransitionInput = {
  /** Status before the save/claim (null for brand-new recipes). */
  previousStatus: string | null;
  /** Status after successful publication save/claim. */
  nextStatus: string;
  /** From {@link recipeHadPriorPublication} before current publish audit/revision. */
  hadPriorPublication: boolean;
};

/**
 * True only for the first time a Recipe becomes publicly Published.
 * Not republish, not Published edits, not slug/update-note-only changes.
 */
export function isFirstEverRecipePublicationTransition(
  input: FirstEverPublicationTransitionInput,
): boolean {
  if (input.nextStatus !== "published") return false;
  if (input.previousStatus === "published") return false;
  if (input.hadPriorPublication) return false;
  return true;
}
