/**
 * Roadmap #11 — Public/Preview resolution of accepted contextual Recipe links.
 *
 * Read-only. No recommendation scoring. No writes.
 */

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import {
  CONTEXTUAL_INTERNAL_LINK_MAX,
  getContextualInternalLinkIds,
  normalizeContextualInternalLinks,
} from "@/lib/contextual-internal-links";

export type ContextualInternalLinkTarget = {
  id: string;
  title: string;
  slug: string;
};

/**
 * Resolve accepted Recipe IDs to Published public targets.
 * Preserves editorial order. Omits Draft/missing. Max 3.
 */
export async function resolvePublishedContextualInternalLinkTargets(
  recipeIds: readonly string[],
): Promise<ContextualInternalLinkTarget[]> {
  const normalized =
    normalizeContextualInternalLinks(
      recipeIds.map((recipeId) => ({ recipeId })),
    )?.map((item) => item.recipeId) ?? [];
  if (!normalized.length) return [];

  const db = getDb();
  const rows = await db.recipe.findMany({
    where: {
      id: { in: normalized },
      status: "published",
    },
    select: {
      id: true,
      title: true,
      slug: true,
      values: true,
    },
  });

  const byId = new Map(
    rows.map((row) => {
      const values = parseValues(row.values);
      const dishName = String(values.dishName ?? "").trim();
      return [
        row.id,
        {
          id: row.id,
          title: resolveRecipeCardTitle({
            title: row.title,
            dishName: dishName || undefined,
          }),
          slug: row.slug,
        } satisfies ContextualInternalLinkTarget,
      ];
    }),
  );

  const ordered: ContextualInternalLinkTarget[] = [];
  for (const id of normalized) {
    const hit = byId.get(id);
    if (hit) ordered.push(hit);
    if (ordered.length >= CONTEXTUAL_INTERNAL_LINK_MAX) break;
  }
  return ordered;
}

/**
 * Load accepted IDs from a Recipe.values blob (or object) then resolve Published targets.
 * Returns [] when no IDs — caller should skip querying when gate OFF / empty.
 */
export async function loadContextualInternalLinkTargetsForRecipe(input: {
  sourceRecipeId: string;
  values: unknown;
}): Promise<ContextualInternalLinkTarget[]> {
  const sourceId = String(input.sourceRecipeId ?? "").trim();
  const parsed =
    typeof input.values === "string"
      ? parseValues(input.values)
      : input.values && typeof input.values === "object" && !Array.isArray(input.values)
        ? (input.values as Record<string, unknown>)
        : {};
  const ids = getContextualInternalLinkIds(parsed, sourceId);
  if (!ids.length) return [];
  return resolvePublishedContextualInternalLinkTargets(ids);
}

/**
 * Find Published (and Draft) source Recipe slugs that still reference targetId
 * in contextualInternalLinks. Admin-only reverse lookup — no Prisma reverse index.
 * Bounded to current catalogue.
 */
export async function findRecipeSlugsLinkingToContextualTarget(
  targetRecipeId: string,
): Promise<string[]> {
  const targetId = String(targetRecipeId ?? "").trim();
  if (!targetId) return [];

  const db = getDb();
  const rows = await db.recipe.findMany({
    select: { id: true, slug: true, values: true },
  });

  const slugs: string[] = [];
  for (const row of rows) {
    if (row.id === targetId) continue;
    const ids = getContextualInternalLinkIds(parseValues(row.values), row.id);
    if (ids.includes(targetId) && row.slug.trim()) {
      slugs.push(row.slug.trim());
    }
  }
  return slugs;
}

/** Revalidate public Recipe routes that may show this Recipe as a Try-next target. */
export async function revalidateRecipesLinkingToContextualTarget(
  targetRecipeId: string,
): Promise<string[]> {
  const slugs = await findRecipeSlugsLinkingToContextualTarget(targetRecipeId);
  for (const slug of slugs) {
    revalidatePath(`/recipes/${slug}`);
  }
  return slugs;
}

/**
 * Pure order helper for tests: map DB rows back to accepted-ID order.
 */
export function orderContextualInternalLinkTargetsByAcceptedIds(
  acceptedIds: readonly string[],
  resolved: ContextualInternalLinkTarget[],
): ContextualInternalLinkTarget[] {
  const byId = new Map(resolved.map((row) => [row.id, row]));
  const out: ContextualInternalLinkTarget[] = [];
  for (const id of acceptedIds) {
    const hit = byId.get(id);
    if (hit) out.push(hit);
    if (out.length >= CONTEXTUAL_INTERNAL_LINK_MAX) break;
  }
  return out;
}
