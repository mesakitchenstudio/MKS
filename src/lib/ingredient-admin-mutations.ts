/**
 * Ingredient Admin mutations (ING-4).
 * Vocabulary changes + targeted reindex. Never mutates Recipe.values.
 */

import type { getDb } from "@/lib/db";
import {
  buildIngredientCreateFields,
  INGREDIENT_MATCH_VIA,
  normalizeIngredientLookupKey,
} from "@/lib/ingredient-identity";
import {
  findIngredientIdentityKeyConflict,
  formatIngredientIdentityKeyConflict,
} from "@/lib/ingredient-index/collision";
import {
  reindexRecipesForIngredientLookupKeys,
  type TargetedIngredientReindexReport,
} from "@/lib/ingredient-index/reindex";

type DbClient = ReturnType<typeof getDb>;

export type IngredientAdminMutationResult =
  | {
      ok: true;
      message: string;
      ingredientId?: string;
      reindex: TargetedIngredientReindexReport;
      aliasCreated?: boolean;
    }
  | { ok: false; error: string; code: string };

async function countUnresolvedForKey(db: DbClient, authoredItemNorm: string) {
  return db.recipeIngredient.count({
    where: {
      matchedVia: INGREDIENT_MATCH_VIA.UNRESOLVED,
      authoredItemNorm,
    },
  });
}

export async function createCanonicalIngredient(
  db: DbClient,
  input: { name: string },
): Promise<IngredientAdminMutationResult> {
  const fields = buildIngredientCreateFields(input.name);
  if (!fields.name) {
    return { ok: false, code: "missing-name", error: "Enter an ingredient name." };
  }
  if (!fields.nameNorm) {
    return {
      ok: false,
      code: "empty-norm",
      error: "That name does not produce a usable ingredient identity key.",
    };
  }
  if (!fields.slug) {
    return { ok: false, code: "invalid-slug", error: "Could not generate a stable slug from that name." };
  }

  const conflict = await findIngredientIdentityKeyConflict(db, {
    normalizedKey: fields.nameNorm,
  });
  if (conflict) {
    return {
      ok: false,
      code: "collision",
      error: formatIngredientIdentityKeyConflict(conflict, "create_ingredient"),
    };
  }

  const slugTaken = await db.ingredient.findUnique({ where: { slug: fields.slug } });
  if (slugTaken) {
    return {
      ok: false,
      code: "slug-collision",
      error: `Slug "${fields.slug}" is already used by "${slugTaken.name}".`,
    };
  }

  try {
    const created = await db.ingredient.create({
      data: {
        name: fields.name,
        nameNorm: fields.nameNorm,
        slug: fields.slug,
      },
    });

    const reindex = await reindexRecipesForIngredientLookupKeys(db, [fields.nameNorm]);
    if (reindex.status === "FAILED") {
      return {
        ok: false,
        code: "reindex-failed",
        error: `Ingredient created, but reindex failed for ${reindex.failures.length} recipe(s). Retry or run ingredient:backfill.`,
      };
    }

    return {
      ok: true,
      ingredientId: created.id,
      message:
        reindex.rebuilt > 0
          ? `Created “${created.name}”. ${reindex.rebuilt} recipes reindexed.`
          : `Created “${created.name}”.`,
      reindex,
      aliasCreated: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Unique constraint/i.test(message)) {
      return { ok: false, code: "collision", error: "This ingredient already exists." };
    }
    return { ok: false, code: "db-error", error: "Could not create the ingredient." };
  }
}

export async function addIngredientAlias(
  db: DbClient,
  input: { ingredientId: string; alias: string },
): Promise<IngredientAdminMutationResult> {
  const alias = String(input.alias ?? "").trim();
  if (!alias) {
    return { ok: false, code: "missing-alias", error: "Enter an alias phrase." };
  }
  const aliasNorm = normalizeIngredientLookupKey(alias);
  if (!aliasNorm) {
    return {
      ok: false,
      code: "empty-norm",
      error: "That alias does not produce a usable identity key.",
    };
  }

  const ingredient = await db.ingredient.findUnique({ where: { id: input.ingredientId } });
  if (!ingredient) {
    return { ok: false, code: "missing-ingredient", error: "That ingredient no longer exists." };
  }
  if (aliasNorm === ingredient.nameNorm) {
    return {
      ok: false,
      code: "redundant-alias",
      error: `"${ingredient.name}" already matches that phrase as its canonical name.`,
    };
  }

  const conflict = await findIngredientIdentityKeyConflict(db, {
    normalizedKey: aliasNorm,
    allowOwnedByIngredientId: ingredient.id,
  });
  if (conflict) {
    return {
      ok: false,
      code: "collision",
      error: formatIngredientIdentityKeyConflict(conflict, "add_alias"),
    };
  }

  const existingOwned = await db.ingredientAlias.findUnique({ where: { aliasNorm } });
  if (existingOwned && existingOwned.ingredientId === ingredient.id) {
    return {
      ok: true,
      ingredientId: ingredient.id,
      message: `Alias “${alias}” already exists on ${ingredient.name}.`,
      reindex: { status: "NOOP", recipeIds: [], rebuilt: 0, failures: [] },
      aliasCreated: false,
    };
  }

  try {
    await db.ingredientAlias.create({
      data: {
        ingredientId: ingredient.id,
        alias,
        aliasNorm,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Unique constraint/i.test(message)) {
      return {
        ok: false,
        code: "collision",
        error: "This alias is already assigned to another ingredient.",
      };
    }
    return { ok: false, code: "db-error", error: "Could not add the alias." };
  }

  const reindex = await reindexRecipesForIngredientLookupKeys(db, [aliasNorm]);
  if (reindex.status === "FAILED") {
    return {
      ok: false,
      code: "reindex-failed",
      error: `Alias saved, but reindex failed for ${reindex.failures.length} recipe(s).`,
    };
  }

  return {
    ok: true,
    ingredientId: ingredient.id,
    message: `Added alias “${alias}” to ${ingredient.name}. ${reindex.rebuilt} recipes reindexed.`,
    reindex,
    aliasCreated: true,
  };
}

export async function removeIngredientAlias(
  db: DbClient,
  input: { aliasId: string },
): Promise<IngredientAdminMutationResult> {
  const alias = await db.ingredientAlias.findUnique({
    where: { id: input.aliasId },
    include: { ingredient: { select: { id: true, name: true } } },
  });
  if (!alias) {
    return { ok: false, code: "missing-alias", error: "That alias no longer exists." };
  }

  const aliasNorm = alias.aliasNorm;
  await db.ingredientAlias.delete({ where: { id: alias.id } });

  const reindex = await reindexRecipesForIngredientLookupKeys(db, [aliasNorm]);
  if (reindex.status === "FAILED") {
    return {
      ok: false,
      code: "reindex-failed",
      error: `Alias removed, but reindex failed for ${reindex.failures.length} recipe(s).`,
    };
  }

  return {
    ok: true,
    ingredientId: alias.ingredient.id,
    message: `Removed alias “${alias.alias}” from ${alias.ingredient.name}. ${reindex.rebuilt} recipes reindexed.`,
    reindex,
  };
}

/**
 * Map an unresolved authoredItemNorm to an existing Ingredient.
 * Creates an alias only when norms differ.
 */
export async function resolveUnresolvedToExistingIngredient(
  db: DbClient,
  input: { authoredItemNorm: string; ingredientId: string; representativeAuthoredItem?: string },
): Promise<IngredientAdminMutationResult> {
  const authoredItemNorm = normalizeIngredientLookupKey(input.authoredItemNorm);
  if (!authoredItemNorm) {
    return { ok: false, code: "missing-key", error: "Missing unresolved ingredient key." };
  }

  const unresolvedCount = await countUnresolvedForKey(db, authoredItemNorm);
  if (unresolvedCount === 0) {
    return {
      ok: false,
      code: "already-resolved",
      error: "This ingredient has already been resolved or reindexed.",
    };
  }

  const ingredient = await db.ingredient.findUnique({ where: { id: input.ingredientId } });
  if (!ingredient) {
    return { ok: false, code: "missing-ingredient", error: "That ingredient no longer exists." };
  }

  let aliasCreated = false;
  if (authoredItemNorm !== ingredient.nameNorm) {
    const conflict = await findIngredientIdentityKeyConflict(db, {
      normalizedKey: authoredItemNorm,
      allowOwnedByIngredientId: ingredient.id,
    });
    if (conflict) {
      return {
        ok: false,
        code: "collision",
        error: formatIngredientIdentityKeyConflict(conflict, "resolve_alias"),
      };
    }

    const existing = await db.ingredientAlias.findUnique({ where: { aliasNorm: authoredItemNorm } });
    if (!existing) {
      const aliasText =
        String(input.representativeAuthoredItem ?? "").trim() || authoredItemNorm;
      await db.ingredientAlias.create({
        data: {
          ingredientId: ingredient.id,
          alias: aliasText,
          aliasNorm: authoredItemNorm,
        },
      });
      aliasCreated = true;
    } else if (existing.ingredientId !== ingredient.id) {
      return {
        ok: false,
        code: "collision",
        error: `This alias is already assigned to another ingredient.`,
      };
    }
  }

  const reindex = await reindexRecipesForIngredientLookupKeys(db, [authoredItemNorm]);
  if (reindex.status === "FAILED") {
    return {
      ok: false,
      code: "reindex-failed",
      error: `Mapping saved, but reindex failed for ${reindex.failures.length} recipe(s).`,
    };
  }

  const remaining = await countUnresolvedForKey(db, authoredItemNorm);
  if (remaining > 0) {
    return {
      ok: false,
      code: "stale-unresolved",
      error: `Reindex finished but ${remaining} unresolved row(s) remain for this key.`,
    };
  }

  return {
    ok: true,
    ingredientId: ingredient.id,
    aliasCreated,
    message: `Resolved “${authoredItemNorm}” as ${ingredient.name}. ${reindex.rebuilt} recipes reindexed.`,
    reindex,
  };
}

/**
 * Create a new canonical Ingredient and map the unresolved key to it.
 */
export async function resolveUnresolvedToNewIngredient(
  db: DbClient,
  input: {
    authoredItemNorm: string;
    canonicalName: string;
    representativeAuthoredItem?: string;
  },
): Promise<IngredientAdminMutationResult> {
  const authoredItemNorm = normalizeIngredientLookupKey(input.authoredItemNorm);
  if (!authoredItemNorm) {
    return { ok: false, code: "missing-key", error: "Missing unresolved ingredient key." };
  }

  const unresolvedCount = await countUnresolvedForKey(db, authoredItemNorm);
  if (unresolvedCount === 0) {
    return {
      ok: false,
      code: "already-resolved",
      error: "This ingredient has already been resolved or reindexed.",
    };
  }

  const created = await createCanonicalIngredient(db, { name: input.canonicalName });
  if (!created.ok) return created;

  // createCanonicalIngredient already reindexed exact nameNorm matches.
  // If unresolved key differs, add alias + reindex that key.
  if (authoredItemNorm !== normalizeIngredientLookupKey(input.canonicalName)) {
    const mapped = await resolveUnresolvedToExistingIngredient(db, {
      authoredItemNorm,
      ingredientId: created.ingredientId!,
      representativeAuthoredItem: input.representativeAuthoredItem,
    });
    if (!mapped.ok) return mapped;
    return {
      ok: true,
      ingredientId: created.ingredientId,
      aliasCreated: mapped.aliasCreated,
      message: `Created “${input.canonicalName.trim()}” and resolved “${authoredItemNorm}”. ${mapped.reindex.rebuilt} recipes reindexed.`,
      reindex: mapped.reindex,
    };
  }

  const remaining = await countUnresolvedForKey(db, authoredItemNorm);
  if (remaining > 0) {
    // Exact create should have reindexed; if still unresolved, force reindex again.
    const reindex = await reindexRecipesForIngredientLookupKeys(db, [authoredItemNorm]);
    if (reindex.status === "FAILED" || (await countUnresolvedForKey(db, authoredItemNorm)) > 0) {
      return {
        ok: false,
        code: "stale-unresolved",
        error: "Ingredient created, but unresolved rows remain. Retry reindex.",
      };
    }
    return {
      ok: true,
      ingredientId: created.ingredientId,
      aliasCreated: false,
      message: `Created “${input.canonicalName.trim()}” and resolved “${authoredItemNorm}”. ${reindex.rebuilt} recipes reindexed.`,
      reindex,
    };
  }

  return {
    ok: true,
    ingredientId: created.ingredientId,
    aliasCreated: false,
    message: created.message,
    reindex: created.reindex,
  };
}
