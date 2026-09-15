/**
 * Roadmap #8D — durable first-ever Recipe publication detection.
 *
 * `publishedAt` alone is insufficient: unpublish clears it, so republish looks
 * like a first publish. Use editorial history (AdminAuditEvent / RecipeRevision)
 * captured before the current publish transition.
 */

import { getDb } from "@/lib/db";

/** Whether this Recipe has ever been publicly published before the current transition. */
export async function recipeHadPriorPublication(recipeId: string): Promise<boolean> {
  const id = recipeId.trim();
  if (!id) return false;

  const db = getDb();
  const [audit, revision] = await Promise.all([
    db.adminAuditEvent.findFirst({
      where: { entityId: id, action: "recipe.published" },
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
