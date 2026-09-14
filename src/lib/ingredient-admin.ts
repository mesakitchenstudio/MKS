/**
 * Admin Ingredient management queries (ING-4).
 * Recipe.values.ingredients remains authoritative; this layer never edits derived rows in place.
 */

import type { getDb } from "@/lib/db";
import { INGREDIENT_MATCH_VIA } from "@/lib/ingredient-identity";
import { reportRecipeIngredientCoverage } from "@/lib/ingredient-index/coverage";
import type { RecipeIngredientCoverageReport } from "@/lib/ingredient-index/types";
import { loadPublishedRecipeCountsByIngredientIds } from "@/lib/ingredient-seo";

type DbClient = ReturnType<typeof getDb>;

export const INGREDIENT_ADMIN_PAGE_SIZE = 25;

export type AdminIngredientCoverage = RecipeIngredientCoverageReport & {
  emptyIndex: boolean;
  emptyVocabulary: boolean;
};

export type AdminUnresolvedGroup = {
  authoredItemNorm: string;
  representativeAuthoredItem: string;
  occurrenceCount: number;
  recipeCount: number;
  recipeTitles: string[];
};

export type AdminUnresolvedPage = {
  groups: AdminUnresolvedGroup[];
  totalGroups: number;
  page: number;
  pageSize: number;
  q: string;
};

export type AdminIngredientListItem = {
  id: string;
  name: string;
  nameNorm: string;
  slug: string;
  aliasCount: number;
  aliases: Array<{ id: string; alias: string; aliasNorm: string }>;
  /** Distinct recipes of any status (index usage). */
  recipeCount: number;
  /** Distinct Published recipes only (SEO eligibility). */
  publishedRecipeCount: number;
  rowCount: number;
};

export type AdminIngredientListPage = {
  items: AdminIngredientListItem[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
};

export async function loadAdminIngredientCoverage(db: DbClient): Promise<AdminIngredientCoverage> {
  const report = await reportRecipeIngredientCoverage(db);
  return {
    ...report,
    emptyIndex: report.ingredientRowsIndexed === 0,
    emptyVocabulary: report.canonicalIngredients === 0 && report.aliases === 0,
  };
}

export async function loadAdminUnresolvedIngredientPage(
  db: DbClient,
  options?: { page?: number; pageSize?: number; q?: string },
): Promise<AdminUnresolvedPage> {
  const pageSize = Math.min(
    Math.max(options?.pageSize ?? INGREDIENT_ADMIN_PAGE_SIZE, 1),
    100,
  );
  const page = Math.max(options?.page ?? 1, 1);
  const q = String(options?.q ?? "").trim().toLowerCase();

  const where = {
    matchedVia: INGREDIENT_MATCH_VIA.UNRESOLVED,
    ...(q
      ? {
          OR: [
            { authoredItemNorm: { contains: q } },
            { authoredItem: { contains: q } },
          ],
        }
      : {}),
  };

  const grouped = await db.recipeIngredient.groupBy({
    by: ["authoredItemNorm"],
    where,
    _count: { _all: true },
  });

  grouped.sort((a, b) => {
    if (b._count._all !== a._count._all) return b._count._all - a._count._all;
    return a.authoredItemNorm.localeCompare(b.authoredItemNorm);
  });

  const totalGroups = grouped.length;
  const slice = grouped.slice((page - 1) * pageSize, page * pageSize);
  const norms = slice.map((row) => row.authoredItemNorm);

  if (!norms.length) {
    return { groups: [], totalGroups, page, pageSize, q: options?.q?.trim() ?? "" };
  }

  const sampleRows = await db.recipeIngredient.findMany({
    where: {
      matchedVia: INGREDIENT_MATCH_VIA.UNRESOLVED,
      authoredItemNorm: { in: norms },
    },
    select: {
      authoredItemNorm: true,
      authoredItem: true,
      recipeId: true,
      recipe: { select: { title: true } },
    },
  });

  const byNorm = new Map<
    string,
    { representative: string; recipes: Map<string, string>; count: number }
  >();
  for (const norm of norms) {
    const count = slice.find((row) => row.authoredItemNorm === norm)?._count._all ?? 0;
    byNorm.set(norm, { representative: norm, recipes: new Map(), count });
  }
  for (const row of sampleRows) {
    const entry = byNorm.get(row.authoredItemNorm);
    if (!entry) continue;
    if (entry.representative === row.authoredItemNorm || !entry.representative) {
      entry.representative = row.authoredItem;
    }
    entry.recipes.set(row.recipeId, row.recipe.title);
  }

  const groups: AdminUnresolvedGroup[] = norms.map((norm) => {
    const entry = byNorm.get(norm)!;
    const titles = [...entry.recipes.values()].sort((a, b) => a.localeCompare(b));
    return {
      authoredItemNorm: norm,
      representativeAuthoredItem: entry.representative || norm,
      occurrenceCount: entry.count,
      recipeCount: entry.recipes.size,
      recipeTitles: titles.slice(0, 8),
    };
  });

  return {
    groups,
    totalGroups,
    page,
    pageSize,
    q: options?.q?.trim() ?? "",
  };
}

export async function loadAdminIngredientListPage(
  db: DbClient,
  options?: { page?: number; pageSize?: number; q?: string },
): Promise<AdminIngredientListPage> {
  const pageSize = Math.min(
    Math.max(options?.pageSize ?? INGREDIENT_ADMIN_PAGE_SIZE, 1),
    100,
  );
  const page = Math.max(options?.page ?? 1, 1);
  const q = String(options?.q ?? "").trim();

  const where = q
    ? {
        OR: [
          { name: { contains: q } },
          { nameNorm: { contains: q.toLowerCase() } },
          { slug: { contains: q.toLowerCase() } },
          { aliases: { some: { OR: [{ alias: { contains: q } }, { aliasNorm: { contains: q.toLowerCase() } }] } } },
        ],
      }
    : {};

  const [total, rows] = await Promise.all([
    db.ingredient.count({ where }),
    db.ingredient.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        aliases: {
          orderBy: { alias: "asc" },
          select: { id: true, alias: true, aliasNorm: true },
        },
        _count: { select: { aliases: true, recipeIngredients: true } },
      },
    }),
  ]);

  const ids = rows.map((row) => row.id);
  const usageGrouped = ids.length
    ? await db.recipeIngredient.groupBy({
        by: ["ingredientId"],
        where: { ingredientId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const rowCountById = new Map(
    usageGrouped.map((row) => [row.ingredientId!, row._count._all] as const),
  );

  // Distinct recipe counts — one query for page ids
  const distinctRows = ids.length
    ? await db.recipeIngredient.findMany({
        where: { ingredientId: { in: ids } },
        distinct: ["ingredientId", "recipeId"],
        select: { ingredientId: true, recipeId: true },
      })
    : [];
  const recipeCountById = new Map<string, number>();
  for (const row of distinctRows) {
    if (!row.ingredientId) continue;
    recipeCountById.set(row.ingredientId, (recipeCountById.get(row.ingredientId) ?? 0) + 1);
  }

  const publishedById = await loadPublishedRecipeCountsByIngredientIds(db, ids);

  const items: AdminIngredientListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameNorm: row.nameNorm,
    slug: row.slug,
    aliasCount: row._count.aliases,
    aliases: row.aliases,
    recipeCount: recipeCountById.get(row.id) ?? 0,
    publishedRecipeCount: publishedById.get(row.id) ?? 0,
    rowCount: rowCountById.get(row.id) ?? row._count.recipeIngredients,
  }));

  return { items, total, page, pageSize, q };
}

export async function loadAdminIngredientOptions(
  db: DbClient,
  options?: { q?: string; take?: number },
): Promise<Array<{ id: string; name: string; nameNorm: string }>> {
  const q = String(options?.q ?? "").trim();
  const take = Math.min(Math.max(options?.take ?? 40, 1), 80);
  return db.ingredient.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { nameNorm: { contains: q.toLowerCase() } },
            { aliases: { some: { alias: { contains: q } } } },
          ],
        }
      : {},
    orderBy: { name: "asc" },
    take,
    select: { id: true, name: true, nameNorm: true },
  });
}

export function formatCoveragePercent(coverage: AdminIngredientCoverage): string {
  if (coverage.emptyIndex) return "—";
  return `${coverage.coveragePercent}%`;
}
