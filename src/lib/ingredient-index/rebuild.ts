import type { Prisma } from "@prisma/client";
import type { getDb } from "@/lib/db";
import { normalizeIngredientLookupKey } from "@/lib/ingredient-identity";
import {
  assertRecipeIngredientRowInvariant,
  buildRecipeIngredientIndexRows,
  extractAuthoredIngredientItems,
  parseRecipeValuesIngredients,
} from "./build-rows";
import { loadIngredientIdentityCatalogForKeys } from "./lookup";

type DbClient = Prisma.TransactionClient | ReturnType<typeof getDb>;

/**
 * DELETE + REBUILD derived RecipeIngredient rows for one Recipe.
 *
 * - Does not mutate Recipe.values
 * - Does not touch Recipe.updatedAt
 * - Unresolved matches are success (ingredientId null)
 * - Technical / invariant failures throw (caller transaction should roll back)
 */
export async function rebuildRecipeIngredientIndex(
  db: DbClient,
  input: {
    recipeId: string;
    values: string | Record<string, unknown> | null | undefined;
  },
): Promise<{ rowCount: number }> {
  const ingredientsRaw = parseRecipeValuesIngredients(input.values);
  const items = extractAuthoredIngredientItems(ingredientsRaw);
  const norms = [
    ...new Set(
      items
        .map((item) => normalizeIngredientLookupKey(item.authoredItem))
        .filter(Boolean),
    ),
  ];

  const catalog = await loadIngredientIdentityCatalogForKeys(db, norms);
  const rows = buildRecipeIngredientIndexRows({
    recipeId: input.recipeId,
    items,
    ingredients: catalog.ingredients,
    aliases: catalog.aliases,
  });

  for (const row of rows) {
    assertRecipeIngredientRowInvariant(row);
  }

  await db.recipeIngredient.deleteMany({ where: { recipeId: input.recipeId } });

  if (rows.length) {
    await db.recipeIngredient.createMany({
      data: rows.map((row) => ({
        recipeId: row.recipeId,
        ingredientId: row.ingredientId,
        groupIndex: row.groupIndex,
        itemIndex: row.itemIndex,
        authoredItem: row.authoredItem,
        authoredItemNorm: row.authoredItemNorm,
        matchedVia: row.matchedVia,
      })),
    });
  }

  return { rowCount: rows.length };
}
