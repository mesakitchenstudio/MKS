import type { Prisma } from "@prisma/client";
import type { getDb } from "@/lib/db";

type DbClient = Prisma.TransactionClient | ReturnType<typeof getDb>;

export type IngredientKeyPurpose = "create_ingredient" | "add_alias" | "resolve_alias";

export type IngredientIdentityKeyConflict =
  | { kind: "canonical"; ingredientId: string; name: string }
  | { kind: "alias"; aliasId: string; ingredientId: string; ingredientName: string; alias: string };

/**
 * Shared lookup-namespace check: normalized keys must be unique across
 * Ingredient.nameNorm and IngredientAlias.aliasNorm.
 */
export async function findIngredientIdentityKeyConflict(
  db: DbClient,
  input: {
    normalizedKey: string;
    /** When adding an alias that already belongs to this Ingredient, treat as owned (idempotent). */
    allowOwnedByIngredientId?: string | null;
  },
): Promise<IngredientIdentityKeyConflict | null> {
  const key = String(input.normalizedKey ?? "").trim();
  if (!key) return null;

  const [canonical, alias] = await Promise.all([
    db.ingredient.findUnique({
      where: { nameNorm: key },
      select: { id: true, name: true },
    }),
    db.ingredientAlias.findUnique({
      where: { aliasNorm: key },
      select: {
        id: true,
        alias: true,
        ingredientId: true,
        ingredient: { select: { name: true } },
      },
    }),
  ]);

  if (canonical) {
    if (input.allowOwnedByIngredientId && canonical.id === input.allowOwnedByIngredientId) {
      // Target ingredient's own nameNorm — caller decides redundancy separately.
    } else {
      return { kind: "canonical", ingredientId: canonical.id, name: canonical.name };
    }
  }

  if (alias) {
    if (input.allowOwnedByIngredientId && alias.ingredientId === input.allowOwnedByIngredientId) {
      return null;
    }
    return {
      kind: "alias",
      aliasId: alias.id,
      ingredientId: alias.ingredientId,
      ingredientName: alias.ingredient.name,
      alias: alias.alias,
    };
  }

  return null;
}

export function formatIngredientIdentityKeyConflict(
  conflict: IngredientIdentityKeyConflict,
  purpose: IngredientKeyPurpose,
): string {
  if (conflict.kind === "canonical") {
    if (purpose === "add_alias" || purpose === "resolve_alias") {
      return `"${conflict.name}" is already a canonical ingredient, so it cannot also be added as an alias.`;
    }
    return `This ingredient already exists ("${conflict.name}").`;
  }
  if (purpose === "create_ingredient") {
    return `This name is already used as an alias for "${conflict.ingredientName}".`;
  }
  return `This alias is already assigned to ${conflict.ingredientName}.`;
}
