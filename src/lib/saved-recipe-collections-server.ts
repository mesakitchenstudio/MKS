import type { Recipe } from "@/data/types";
import { getDb } from "@/lib/db";
import {
  SAVED_RECIPE_COLLECTIONS_MAX_PER_MEMBER,
  normalizeCollectionIdList,
  type MemberCollectionSummary,
  type RecipeCollectionPickerState,
  type SavedRecipeCollectionActionResult,
  type SavedRecipeCollectionError,
  validateSavedRecipeCollectionName,
} from "@/lib/saved-recipe-collections";

function fail(
  error: SavedRecipeCollectionError,
  message: string,
): SavedRecipeCollectionActionResult<never> {
  return { ok: false, error, message };
}

export type { MemberCollectionSummary, RecipeCollectionPickerState };

export type MemberCollectionDetail = {
  id: string;
  name: string;
  visibleCount: number;
  /** Published recipes currently resolvable for cards, most recently added first. */
  recipes: Recipe[];
  /** Membership rows for add/remove (includes recipeSaveId). */
  memberships: { itemId: string; recipeSaveId: string; slug: string }[];
};

function publishedBySlug(published: Recipe[]) {
  return new Map(published.map((recipe) => [recipe.slug, recipe]));
}

function resolveSaveSlug(save: {
  slug: string;
  recipe: { slug: string } | null;
}): string {
  return save.recipe?.slug || save.slug;
}

/**
 * List private collections for a member with visible (published) recipe counts.
 * Hidden/orphan/draft memberships remain in DB but are omitted from counts.
 */
export async function getMemberSavedCollections(
  userId: string,
  publishedRecipes: Recipe[],
): Promise<MemberCollectionSummary[]> {
  if (!userId) return [];
  const bySlug = publishedBySlug(publishedRecipes);
  const rows = await getDb().savedRecipeCollection.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      items: {
        include: {
          recipeSave: { include: { recipe: { select: { slug: true, status: true } } } },
        },
      },
    },
  });

  return rows.map((row) => {
    let visibleCount = 0;
    for (const item of row.items) {
      const slug = resolveSaveSlug(item.recipeSave);
      if (bySlug.has(slug)) visibleCount += 1;
    }
    return {
      id: row.id,
      name: row.name,
      visibleCount,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

/** Owner-only collection detail. Returns null when missing or not owned. */
export async function getMemberSavedCollection(
  userId: string,
  collectionId: string,
  publishedRecipes: Recipe[],
): Promise<MemberCollectionDetail | null> {
  if (!userId || !collectionId) return null;
  const bySlug = publishedBySlug(publishedRecipes);
  const row = await getDb().savedRecipeCollection.findFirst({
    where: { id: collectionId, userId },
    include: {
      items: {
        orderBy: { createdAt: "desc" },
        include: {
          recipeSave: { include: { recipe: { select: { slug: true, status: true } } } },
        },
      },
    },
  });
  if (!row) return null;

  const recipes: Recipe[] = [];
  const memberships: MemberCollectionDetail["memberships"] = [];
  const seen = new Set<string>();

  for (const item of row.items) {
    const slug = resolveSaveSlug(item.recipeSave);
    memberships.push({ itemId: item.id, recipeSaveId: item.recipeSaveId, slug });
    const recipe = bySlug.get(slug);
    if (recipe && !seen.has(recipe.slug)) {
      seen.add(recipe.slug);
      recipes.push(recipe);
    }
  }

  return {
    id: row.id,
    name: row.name,
    visibleCount: recipes.length,
    recipes,
    memberships,
  };
}

export async function createSavedRecipeCollectionForUser(
  userId: string,
  rawName: unknown,
): Promise<SavedRecipeCollectionActionResult<{ id: string; name: string }>> {
  const validated = validateSavedRecipeCollectionName(rawName);
  if (!validated.ok) return fail(validated.error, validated.message);

  const db = getDb();
  const count = await db.savedRecipeCollection.count({ where: { userId } });
  if (count >= SAVED_RECIPE_COLLECTIONS_MAX_PER_MEMBER) {
    return fail(
      "COLLECTION_LIMIT",
      `You can create up to ${SAVED_RECIPE_COLLECTIONS_MAX_PER_MEMBER} collections.`,
    );
  }

  const existing = await db.savedRecipeCollection.findUnique({
    where: {
      userId_nameNorm: { userId, nameNorm: validated.nameNorm },
    },
  });
  if (existing) {
    return fail("DUPLICATE_NAME", "You already have a collection with that name.");
  }

  try {
    const created = await db.savedRecipeCollection.create({
      data: {
        userId,
        name: validated.name,
        nameNorm: validated.nameNorm,
      },
    });
    return { ok: true, data: { id: created.id, name: created.name } };
  } catch {
    return fail("DUPLICATE_NAME", "You already have a collection with that name.");
  }
}

export async function renameSavedRecipeCollectionForUser(
  userId: string,
  collectionId: string,
  rawName: unknown,
): Promise<SavedRecipeCollectionActionResult<{ id: string; name: string }>> {
  const validated = validateSavedRecipeCollectionName(rawName);
  if (!validated.ok) return fail(validated.error, validated.message);

  const db = getDb();
  const collection = await db.savedRecipeCollection.findFirst({
    where: { id: collectionId, userId },
  });
  if (!collection) return fail("NOT_FOUND", "Collection not found.");

  const clash = await db.savedRecipeCollection.findFirst({
    where: {
      userId,
      nameNorm: validated.nameNorm,
      NOT: { id: collectionId },
    },
  });
  if (clash) {
    return fail("DUPLICATE_NAME", "You already have a collection with that name.");
  }

  try {
    const updated = await db.savedRecipeCollection.update({
      where: { id: collectionId },
      data: { name: validated.name, nameNorm: validated.nameNorm },
    });
    return { ok: true, data: { id: updated.id, name: updated.name } };
  } catch {
    return fail("DUPLICATE_NAME", "You already have a collection with that name.");
  }
}

/** Deletes the collection and memberships only — never RecipeSave rows. */
export async function deleteSavedRecipeCollectionForUser(
  userId: string,
  collectionId: string,
): Promise<SavedRecipeCollectionActionResult> {
  const db = getDb();
  const collection = await db.savedRecipeCollection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true },
  });
  if (!collection) return fail("NOT_FOUND", "Collection not found.");

  await db.savedRecipeCollection.delete({ where: { id: collectionId } });
  return { ok: true };
}

/**
 * Add an existing RecipeSave to a collection owned by the same member.
 * Cross-user collection + save combinations are rejected.
 */
export async function addSavedRecipeToCollectionForUser(
  userId: string,
  collectionId: string,
  recipeSaveId: string,
): Promise<SavedRecipeCollectionActionResult<{ itemId: string }>> {
  if (!collectionId || !recipeSaveId) {
    return fail("NOT_FOUND", "Collection or save not found.");
  }

  const db = getDb();
  const collection = await db.savedRecipeCollection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true },
  });
  if (!collection) return fail("NOT_FOUND", "Collection not found.");

  const save = await db.recipeSave.findFirst({
    where: { id: recipeSaveId, userId },
    select: { id: true },
  });
  if (!save) return fail("NOT_SAVED", "That recipe is not in your saved recipes.");

  const existing = await db.savedRecipeCollectionItem.findUnique({
    where: {
      collectionId_recipeSaveId: {
        collectionId,
        recipeSaveId,
      },
    },
  });
  if (existing) {
    return { ok: true, data: { itemId: existing.id } };
  }

  const item = await db.savedRecipeCollectionItem.create({
    data: { collectionId, recipeSaveId },
  });
  await db.savedRecipeCollection.update({
    where: { id: collectionId },
    data: { updatedAt: new Date() },
  });
  return { ok: true, data: { itemId: item.id } };
}

/** Remove membership only — RecipeSave remains. */
export async function removeSavedRecipeFromCollectionForUser(
  userId: string,
  collectionId: string,
  recipeSaveId: string,
): Promise<SavedRecipeCollectionActionResult> {
  const db = getDb();
  const collection = await db.savedRecipeCollection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true },
  });
  if (!collection) return fail("NOT_FOUND", "Collection not found.");

  const deleted = await db.savedRecipeCollectionItem.deleteMany({
    where: { collectionId, recipeSaveId },
  });
  if (deleted.count === 0) return fail("NOT_FOUND", "That recipe is not in this collection.");

  await db.savedRecipeCollection.update({
    where: { id: collectionId },
    data: { updatedAt: new Date() },
  });
  return { ok: true };
}

/** Resolve RecipeSave.id for a member by recipe slug (current or denormalized). */
export async function findMemberRecipeSaveIdBySlug(
  userId: string,
  slug: string,
): Promise<string | null> {
  const trimmed = slug.trim();
  if (!userId || !trimmed) return null;
  const save = await getDb().recipeSave.findFirst({
    where: {
      userId,
      OR: [{ slug: trimmed }, { recipe: { slug: trimmed } }],
    },
    select: { id: true },
  });
  return save?.id ?? null;
}

async function findMemberRecipeSave(
  userId: string,
  input: { recipeId?: string; recipeSlug?: string },
): Promise<{ id: string } | null> {
  const recipeId = String(input.recipeId ?? "").trim();
  const recipeSlug = String(input.recipeSlug ?? "").trim();
  if (!userId || (!recipeId && !recipeSlug)) return null;
  const db = getDb();
  if (recipeId) {
    const byId = await db.recipeSave.findFirst({
      where: { userId, recipeId },
      select: { id: true },
    });
    if (byId) return byId;
  }
  if (recipeSlug) {
    const saveId = await findMemberRecipeSaveIdBySlug(userId, recipeSlug);
    if (saveId) return { id: saveId };
  }
  return null;
}

/** Membership count for unsave confirmation (owner-only). */
export async function countRecipeSaveCollectionMembershipsForUser(
  userId: string,
  input: { recipeId?: string; recipeSlug?: string },
): Promise<SavedRecipeCollectionActionResult<{ count: number; recipeSaveId: string }>> {
  const save = await findMemberRecipeSave(userId, input);
  if (!save) return fail("NOT_SAVED", "That recipe is not in your saved recipes.");
  const count = await getDb().savedRecipeCollectionItem.count({
    where: { recipeSaveId: save.id },
  });
  return { ok: true, data: { count, recipeSaveId: save.id } };
}

/**
 * Lazy picker read: member collections + selected memberships for one saved recipe.
 * Prefer stable Recipe.id; slug is fallback for older clients.
 */
export async function getRecipeCollectionPickerStateForUser(
  userId: string,
  input: { recipeId?: string; recipeSlug?: string },
): Promise<SavedRecipeCollectionActionResult<RecipeCollectionPickerState>> {
  const save = await findMemberRecipeSave(userId, input);
  if (!save) return fail("NOT_SAVED", "That recipe is not in your saved recipes.");

  const db = getDb();
  const [collections, memberships] = await Promise.all([
    db.savedRecipeCollection.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
    db.savedRecipeCollectionItem.findMany({
      where: { recipeSaveId: save.id },
      select: { collectionId: true },
    }),
  ]);

  const selected = new Set(memberships.map((row) => row.collectionId));
  return {
    ok: true,
    data: {
      recipeSaveId: save.id,
      membershipCount: selected.size,
      collections: collections.map((row) => ({
        id: row.id,
        name: row.name,
        selected: selected.has(row.id),
      })),
    },
  };
}

/**
 * Synchronize collection memberships for a saved recipe to exactly `collectionIds`.
 * Preserves RecipeSave. Rejects cross-user collection ids.
 */
export async function setSavedRecipeCollectionMembershipsForUser(
  userId: string,
  input: { recipeId?: string; recipeSlug?: string; collectionIds: unknown },
): Promise<
  SavedRecipeCollectionActionResult<{ selectedIds: string[]; changedCollectionIds: string[] }>
> {
  const save = await findMemberRecipeSave(userId, input);
  if (!save) return fail("NOT_SAVED", "That recipe is not in your saved recipes.");

  const desired = normalizeCollectionIdList(input.collectionIds);
  const db = getDb();

  if (desired.length) {
    const owned = await db.savedRecipeCollection.findMany({
      where: { userId, id: { in: desired } },
      select: { id: true },
    });
    if (owned.length !== desired.length) {
      return fail("NOT_FOUND", "One or more collections were not found.");
    }
  }

  const desiredSet = new Set(desired);
  let changedCollectionIds: string[] = [];

  await db.$transaction(async (tx) => {
    const current = await tx.savedRecipeCollectionItem.findMany({
      where: { recipeSaveId: save.id },
      select: { id: true, collectionId: true },
    });
    const currentIds = new Set(current.map((row) => row.collectionId));
    const toRemove = current.filter((row) => !desiredSet.has(row.collectionId));
    const toAdd = desired.filter((id) => !currentIds.has(id));
    changedCollectionIds = [...new Set([...toRemove.map((r) => r.collectionId), ...toAdd])];

    if (toRemove.length) {
      await tx.savedRecipeCollectionItem.deleteMany({
        where: { id: { in: toRemove.map((row) => row.id) } },
      });
    }
    for (const collectionId of toAdd) {
      await tx.savedRecipeCollectionItem.create({
        data: { collectionId, recipeSaveId: save.id },
      });
    }
    if (changedCollectionIds.length) {
      await tx.savedRecipeCollection.updateMany({
        where: { id: { in: changedCollectionIds }, userId },
        data: { updatedAt: new Date() },
      });
    }
  });

  return { ok: true, data: { selectedIds: desired, changedCollectionIds } };
}

/**
 * Create a collection and immediately attach the current RecipeSave (picker flow).
 */
export async function createCollectionAndAddRecipeForUser(
  userId: string,
  input: { recipeId?: string; recipeSlug?: string; name: unknown },
): Promise<
  SavedRecipeCollectionActionResult<{ id: string; name: string; selectedIds: string[] }>
> {
  const save = await findMemberRecipeSave(userId, input);
  if (!save) return fail("NOT_SAVED", "That recipe is not in your saved recipes.");

  const validated = validateSavedRecipeCollectionName(input.name);
  if (!validated.ok) return fail(validated.error, validated.message);

  const db = getDb();
  const count = await db.savedRecipeCollection.count({ where: { userId } });
  if (count >= SAVED_RECIPE_COLLECTIONS_MAX_PER_MEMBER) {
    return fail(
      "COLLECTION_LIMIT",
      `You can create up to ${SAVED_RECIPE_COLLECTIONS_MAX_PER_MEMBER} collections.`,
    );
  }

  const clash = await db.savedRecipeCollection.findUnique({
    where: { userId_nameNorm: { userId, nameNorm: validated.nameNorm } },
  });
  if (clash) {
    return fail("DUPLICATE_NAME", "You already have a collection with that name.");
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const created = await tx.savedRecipeCollection.create({
        data: {
          userId,
          name: validated.name,
          nameNorm: validated.nameNorm,
        },
      });
      await tx.savedRecipeCollectionItem.create({
        data: { collectionId: created.id, recipeSaveId: save.id },
      });
      const memberships = await tx.savedRecipeCollectionItem.findMany({
        where: { recipeSaveId: save.id },
        select: { collectionId: true },
      });
      return {
        id: created.id,
        name: created.name,
        selectedIds: memberships.map((row) => row.collectionId),
      };
    });
    return { ok: true, data: result };
  } catch {
    return fail("DUPLICATE_NAME", "You already have a collection with that name.");
  }
}
