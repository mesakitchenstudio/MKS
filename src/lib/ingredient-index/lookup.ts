import type { Prisma } from "@prisma/client";
import type { getDb } from "@/lib/db";
import type {
  IngredientAliasRecord,
  IngredientIdentityRecord,
} from "@/lib/ingredient-identity";

type DbClient = Prisma.TransactionClient | ReturnType<typeof getDb>;

/**
 * Batch-load Ingredient + Alias rows for a set of normalized keys.
 * At most one Ingredient query + one Alias query (no N+1).
 */
export async function loadIngredientIdentityCatalogForKeys(
  db: DbClient,
  normalizedKeys: string[],
): Promise<{
  ingredients: IngredientIdentityRecord[];
  aliases: IngredientAliasRecord[];
}> {
  const keys = [...new Set(normalizedKeys.map((k) => String(k ?? "").trim()).filter(Boolean))];
  if (!keys.length) {
    return { ingredients: [], aliases: [] };
  }

  const [exactIngredients, aliasRows] = await Promise.all([
    db.ingredient.findMany({
      where: { nameNorm: { in: keys } },
      select: { id: true, name: true, nameNorm: true },
    }),
    db.ingredientAlias.findMany({
      where: { aliasNorm: { in: keys } },
      select: {
        alias: true,
        aliasNorm: true,
        ingredientId: true,
        ingredient: { select: { id: true, name: true, nameNorm: true } },
      },
    }),
  ]);

  const byId = new Map<string, IngredientIdentityRecord>();
  for (const row of exactIngredients) {
    byId.set(row.id, { id: row.id, name: row.name, nameNorm: row.nameNorm });
  }
  for (const alias of aliasRows) {
    if (!byId.has(alias.ingredient.id)) {
      byId.set(alias.ingredient.id, {
        id: alias.ingredient.id,
        name: alias.ingredient.name,
        nameNorm: alias.ingredient.nameNorm,
      });
    }
  }

  const aliases: IngredientAliasRecord[] = aliasRows.map((row) => ({
    ingredientId: row.ingredientId,
    alias: row.alias,
    aliasNorm: row.aliasNorm,
  }));

  return {
    ingredients: [...byId.values()],
    aliases,
  };
}
