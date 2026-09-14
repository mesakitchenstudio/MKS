import type { getDb } from "@/lib/db";
import { rebuildRecipeIngredientIndex } from "./rebuild";

type DbClient = ReturnType<typeof getDb>;

export type TargetedIngredientReindexReport = {
  status: "SUCCESS" | "FAILED" | "NOOP";
  recipeIds: string[];
  rebuilt: number;
  failures: Array<{ recipeId: string; message: string }>;
};

/**
 * Rebuild RecipeIngredient for Recipes whose derived rows use the given
 * authoredItemNorm keys. Reuses ING-3 rebuild (authoritative Recipe.values).
 * Does not touch Recipe.updatedAt / revisions / recipe audit.
 */
export async function reindexRecipesForIngredientLookupKeys(
  db: DbClient,
  keys: string[],
): Promise<TargetedIngredientReindexReport> {
  const norms = [...new Set(keys.map((k) => String(k ?? "").trim()).filter(Boolean))];
  if (!norms.length) {
    return { status: "NOOP", recipeIds: [], rebuilt: 0, failures: [] };
  }

  const indexed = await db.recipeIngredient.findMany({
    where: { authoredItemNorm: { in: norms } },
    distinct: ["recipeId"],
    select: { recipeId: true },
  });
  const recipeIds = indexed.map((row) => row.recipeId);

  if (!recipeIds.length) {
    return { status: "NOOP", recipeIds: [], rebuilt: 0, failures: [] };
  }

  const recipes = await db.recipe.findMany({
    where: { id: { in: recipeIds } },
    select: { id: true, values: true },
  });

  const report: TargetedIngredientReindexReport = {
    status: "SUCCESS",
    recipeIds: recipes.map((r) => r.id),
    rebuilt: 0,
    failures: [],
  };

  for (const recipe of recipes) {
    try {
      await db.$transaction(async (tx) => {
        await rebuildRecipeIngredientIndex(tx, {
          recipeId: recipe.id,
          values: recipe.values,
        });
      });
      report.rebuilt += 1;
    } catch (error) {
      report.status = "FAILED";
      report.failures.push({
        recipeId: recipe.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
