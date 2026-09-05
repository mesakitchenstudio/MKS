import { getDb } from "@/lib/db";
import { PRODUCTION_RECIPE_TYPE_CORRECTIONS } from "@/lib/production-recipe-type-corrections";

let sync: Promise<{ updated: number }> | null = null;

/** Idempotent: set typeId for known mis-typed recipes. Does not touch course/categories. */
export function ensureRecipeTypeCorrections() {
  if (!sync) {
    sync = applyRecipeTypeCorrections().catch((error) => {
      sync = null;
      console.error("Could not apply recipe type corrections", error);
      return { updated: 0 };
    });
  }
  return sync;
}

export async function applyRecipeTypeCorrections(): Promise<{ updated: number }> {
  if (!PRODUCTION_RECIPE_TYPE_CORRECTIONS.length) return { updated: 0 };

  const db = getDb();
  const types = await db.recipeType.findMany({ select: { id: true, slug: true } });
  const typeBySlug = new Map(types.map((type) => [type.slug, type.id]));

  let updated = 0;
  for (const correction of PRODUCTION_RECIPE_TYPE_CORRECTIONS) {
    const nextTypeId = typeBySlug.get(correction.typeSlug);
    if (!nextTypeId) continue;

    const recipe = await db.recipe.findUnique({
      where: { slug: correction.slug },
      select: { id: true, typeId: true },
    });
    if (!recipe || recipe.typeId === nextTypeId) continue;

    await db.recipe.update({
      where: { id: recipe.id },
      data: { typeId: nextTypeId },
    });
    updated += 1;
  }

  return { updated };
}
