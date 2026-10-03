/**
 * Roadmap #13 Phase 13C — Admin Growth Opportunities server aggregate loaders.
 *
 * Read-only. No persistence, AdminAudit, tracking, AI, or content mutation.
 * Maps canonical Mesa data → 13B pure DTOs → buildGrowthOpportunities().
 *
 * Intentionally omits `import "server-only"` so unit tests can import this module
 * (same pattern as newsletter-campaign-server.ts). Do not import from client bundles.
 */

import { canAccess } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import {
  buildCalendarReadinessInput,
  type CalendarTypeFieldRow,
} from "@/lib/content-calendar/readiness";
import { getContextualInternalLinkIds } from "@/lib/contextual-internal-links";
import { getDb } from "@/lib/db";
import {
  GROWTH_INGREDIENT_NEAR_INDEXABLE_COUNT,
  GROWTH_SEARCH_WINDOW_DAYS,
  GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT,
  buildGrowthOpportunities,
  type GrowthCategoryAggregate,
  type GrowthIngredientAggregate,
  type GrowthOpportunitiesInput,
  type GrowthOpportunity,
  type GrowthOpportunityRuleId,
  type GrowthRecipeAggregate,
  type GrowthSearchAggregate,
  type GrowthSeriesAggregate,
} from "@/lib/growth-opportunities";
import { mapRecipeRowToRecommendationCandidate } from "@/lib/internal-link-recommendations-admin";
import { recommendInternalRecipeLinks } from "@/lib/internal-link-recommendations";
import { readEditorialDishName } from "@/lib/recipe-editor-dish-name";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { parseValues } from "@/lib/recipe-map";
import { getRecipePublishingReadiness } from "@/lib/recipe-publishing-readiness";
import { normalizeRecipePublicationStatus } from "@/lib/recipe-schedule";
import {
  getCanonicalRecipeVideoIdFromValues,
  normalizeStepVideoTimestampSeconds,
} from "@/lib/step-video-timestamps";

/** Max distinct zero-result search aggregates passed into the pure engine. */
export const GROWTH_SEARCH_AGGREGATE_CANDIDATE_CAP = 200;

export type GrowthOpportunitiesResult = {
  opportunities: GrowthOpportunity[];
  generatedAt: string;
  windowDays: typeof GROWTH_SEARCH_WINDOW_DAYS;
  summary: {
    total: number;
    byRule: Partial<Record<GrowthOpportunityRuleId, number>>;
  };
};

export type GrowthLoadOptions = {
  /** Injectable Prisma client (tests). Defaults to getDb(). */
  db?: ReturnType<typeof getDb>;
  /** Injectable clock (tests). Defaults to server now. */
  now?: Date;
  /** Query instrumentation for bounded-query certification. */
  onQuery?: (label: string) => void;
};

type TypeFieldRow = CalendarTypeFieldRow & { typeId: string };

const publishedRecipeSelect = {
  id: true,
  title: true,
  slug: true,
  status: true,
  excerpt: true,
  publishedAt: true,
  relatedRecipeIds: true,
  values: true,
  typeId: true,
  type: { select: { id: true, name: true } },
  categories: {
    select: {
      categoryId: true,
      category: { select: { id: true, name: true, group: true, slug: true } },
    },
  },
  seriesItems: {
    select: {
      series: { select: { id: true, title: true } },
    },
  },
  recipeIngredients: {
    select: {
      ingredientId: true,
      authoredItem: true,
      authoredItemNorm: true,
      ingredient: { select: { id: true, name: true, slug: true } },
    },
  },
} as const;

type PublishedRecipeRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  excerpt: string;
  publishedAt: Date | null;
  relatedRecipeIds: string;
  values: string;
  typeId: string;
  type: { id: string; name: string };
  categories: Array<{
    categoryId: string;
    category: { id: string; name: string; group: string; slug: string };
  }>;
  seriesItems: Array<{
    series: { id: string; title: string };
  }>;
  recipeIngredients: Array<{
    ingredientId: string | null;
    authoredItem: string;
    authoredItemNorm: string;
    ingredient: { id: string; name: string; slug: string } | null;
  }>;
};

/** Permission helper for Growth (content area). */
export function canViewGrowthOpportunities(role: string): boolean {
  return canAccess(role, "content");
}

function track(onQuery: GrowthLoadOptions["onQuery"], label: string) {
  onQuery?.(label);
}

function searchWindow(now: Date) {
  const endExclusive = now;
  const start = new Date(endExclusive.getTime() - GROWTH_SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { start, endExclusive };
}

function countStepTimestamps(values: Record<string, unknown>): number {
  const instructions = values.instructions;
  if (!Array.isArray(instructions)) return 0;
  let count = 0;
  for (const group of instructions) {
    if (!group || typeof group !== "object") continue;
    const stamps = (group as { stepVideoTimestamps?: unknown }).stepVideoTimestamps;
    if (!Array.isArray(stamps)) continue;
    for (const stamp of stamps) {
      if (normalizeStepVideoTimestampSeconds(stamp) != null) count += 1;
    }
  }
  return count;
}

function recipeDisplayTitle(row: Pick<PublishedRecipeRow, "title" | "values">): string {
  const values = parseValues(row.values);
  const dishName = readEditorialDishName(values);
  return resolveRecipeCardTitle({ title: row.title, dishName });
}

function failedRecommendedChecksForRecipe(
  row: PublishedRecipeRow,
  fieldsByType: Map<string, TypeFieldRow[]>,
): GrowthRecipeAggregate["failedRecommendedChecks"] {
  const fields = fieldsByType.get(row.typeId) ?? [];
  const values = parseValues(row.values);
  const readiness = getRecipePublishingReadiness(
    buildCalendarReadinessInput({
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      typeId: row.typeId,
      values,
      categoryIds: row.categories.map((entry) => entry.categoryId),
      typeFields: fields,
    }),
  );
  return readiness.recommended
    .filter((check) => !check.passed)
    .map((check) => ({ id: check.id, label: check.label }));
}

function buildRecipeAggregates(
  rows: PublishedRecipeRow[],
  fieldsByType: Map<string, TypeFieldRow[]>,
): GrowthRecipeAggregate[] {
  const published = rows.filter(
    (row) => normalizeRecipePublicationStatus(row.status) === "published",
  );
  // #11 enrichment: in-memory only on already-loaded Published Recipes (no extra DB).
  const candidates = published.map((row) => mapRecipeRowToRecommendationCandidate(row));
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return published.map((row) => {
    const values = parseValues(row.values);
    const contextualLinkCount = getContextualInternalLinkIds(values, row.id).length;
    const hasUsableYouTube = Boolean(getCanonicalRecipeVideoIdFromValues(values));
    const stepTimestampCount = countStepTimestamps(values);

    let hasContextualSuggestion: boolean | undefined;
    if (contextualLinkCount === 0) {
      const source = byId.get(row.id);
      if (source) {
        const suggestions = recommendInternalRecipeLinks({
          source,
          candidates,
          acceptedRecipeIds: [],
          limit: 1,
        });
        hasContextualSuggestion = suggestions.length > 0;
      }
    }

    return {
      id: row.id,
      title: recipeDisplayTitle(row),
      isPublished: true,
      contextualLinkCount,
      hasContextualSuggestion,
      hasUsableYouTube,
      stepTimestampCount,
      failedRecommendedChecks: failedRecommendedChecksForRecipe(row, fieldsByType),
    };
  });
}

function buildCategoryAggregates(
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    group: string;
    description: string;
  }>,
  publishedRows: PublishedRecipeRow[],
): GrowthCategoryAggregate[] {
  const counts = new Map<string, number>();
  for (const row of publishedRows) {
    if (normalizeRecipePublicationStatus(row.status) !== "published") continue;
    const seen = new Set<string>();
    for (const entry of row.categories) {
      const categoryId = entry.categoryId || entry.category?.id;
      if (!categoryId || seen.has(categoryId)) continue;
      seen.add(categoryId);
      counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
    }
  }

  return categories
    .map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      group: category.group,
      description: category.description,
      publishedRecipeCount: counts.get(category.id) ?? 0,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function buildIngredientAggregates(publishedRows: PublishedRecipeRow[]): GrowthIngredientAggregate[] {
  const byIngredient = new Map<
    string,
    { id: string; slug: string; name: string; recipeIds: Set<string> }
  >();

  for (const row of publishedRows) {
    if (normalizeRecipePublicationStatus(row.status) !== "published") continue;
    for (const item of row.recipeIngredients) {
      const ingredientId = String(item.ingredientId || "").trim();
      const slug = String(item.ingredient?.slug || "").trim();
      const name = String(item.ingredient?.name || "").trim();
      if (!ingredientId || !slug) continue;
      const existing = byIngredient.get(ingredientId);
      if (existing) {
        existing.recipeIds.add(row.id);
      } else {
        byIngredient.set(ingredientId, {
          id: ingredientId,
          slug,
          name: name || slug,
          recipeIds: new Set([row.id]),
        });
      }
    }
  }

  return [...byIngredient.values()]
    .map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      name: entry.name,
      publishedRecipeCount: entry.recipeIds.size,
    }))
    .filter((entry) => entry.publishedRecipeCount === GROWTH_INGREDIENT_NEAR_INDEXABLE_COUNT)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function buildSeriesAggregates(
  seriesRows: Array<{
    id: string;
    title: string;
    isPublished: boolean;
    items: Array<{ recipeId: string | null; recipe: { status: string } | null }>;
  }>,
): GrowthSeriesAggregate[] {
  return seriesRows
    .filter((row) => row.isPublished)
    .map((row) => {
      const publishedIds = new Set<string>();
      for (const item of row.items) {
        const recipeId = String(item.recipeId || "").trim();
        if (!recipeId || !item.recipe) continue;
        if (normalizeRecipePublicationStatus(item.recipe.status) !== "published") continue;
        publishedIds.add(recipeId);
      }
      return {
        id: row.id,
        name: row.title,
        isPublished: true,
        publishedRecipeMemberCount: publishedIds.size,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function buildSearchAggregates(
  rows: Array<{ queryNorm: string; queryRaw: string }>,
): GrowthSearchAggregate[] {
  const map = new Map<string, { queryNorm: string; displayQuery: string; zeroResultCount: number }>();
  for (const row of rows) {
    const queryNorm = String(row.queryNorm || "").trim();
    if (!queryNorm) continue;
    const display = String(row.queryRaw || "").trim() || queryNorm;
    const existing = map.get(queryNorm);
    if (!existing) {
      map.set(queryNorm, { queryNorm, displayQuery: display, zeroResultCount: 1 });
      continue;
    }
    existing.zeroResultCount += 1;
    if (display.length < existing.displayQuery.length) existing.displayQuery = display;
  }

  return [...map.values()]
    .filter((entry) => entry.zeroResultCount >= GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT)
    .sort(
      (a, b) =>
        b.zeroResultCount - a.zeroResultCount || a.queryNorm.localeCompare(b.queryNorm),
    )
    .slice(0, GROWTH_SEARCH_AGGREGATE_CANDIDATE_CAP)
    .map((entry) => ({
      queryNorm: entry.queryNorm,
      displayQuery: entry.displayQuery,
      zeroResultCount: entry.zeroResultCount,
      windowDays: GROWTH_SEARCH_WINDOW_DAYS,
    }));
}

function summarizeOpportunities(opportunities: GrowthOpportunity[]) {
  const byRule: Partial<Record<GrowthOpportunityRuleId, number>> = {};
  for (const opportunity of opportunities) {
    byRule[opportunity.ruleId] = (byRule[opportunity.ruleId] ?? 0) + 1;
  }
  return { total: opportunities.length, byRule };
}

/**
 * Bounded read-only aggregate loaders → GrowthOpportunitiesInput.
 * No auth (for tests). No writes.
 */
export async function loadGrowthOpportunityInputs(
  options: GrowthLoadOptions = {},
): Promise<GrowthOpportunitiesInput> {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const onQuery = options.onQuery;
  const window = searchWindow(now);

  track(onQuery, "recipe.findMany");
  track(onQuery, "category.findMany");
  track(onQuery, "series.findMany");
  track(onQuery, "searchEvent.findMany");

  const [publishedRecipes, categories, seriesRows, searchRows] = await Promise.all([
    db.recipe.findMany({
      where: { status: "published" },
      select: publishedRecipeSelect,
      orderBy: [{ title: "asc" }, { id: "asc" }],
    }) as Promise<PublishedRecipeRow[]>,
    db.category.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        group: true,
        description: true,
      },
      orderBy: [{ slug: "asc" }],
    }),
    db.series.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        title: true,
        isPublished: true,
        items: {
          select: {
            recipeId: true,
            recipe: { select: { status: true } },
          },
        },
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
    }),
    db.searchEvent.findMany({
      where: {
        zeroResult: true,
        createdAt: { gte: window.start, lt: window.endExclusive },
        queryNorm: { not: "" },
      },
      select: {
        queryNorm: true,
        queryRaw: true,
        // Intentionally omit visitorId and all identity/network fields.
      },
    }),
  ]);

  const typeIds = [...new Set(publishedRecipes.map((row) => row.typeId))];
  let typeFields: TypeFieldRow[] = [];
  if (typeIds.length > 0) {
    track(onQuery, "recipeTypeField.findMany");
    typeFields = (await db.recipeTypeField.findMany({
      where: { typeId: { in: typeIds } },
      orderBy: { sortOrder: "asc" },
      select: {
        typeId: true,
        key: true,
        label: true,
        kind: true,
        required: true,
        options: true,
        helpText: true,
      },
    })) as TypeFieldRow[];
  }

  const fieldsByType = new Map<string, TypeFieldRow[]>();
  for (const field of typeFields) {
    const list = fieldsByType.get(field.typeId) ?? [];
    list.push(field);
    fieldsByType.set(field.typeId, list);
  }

  return {
    searches: buildSearchAggregates(searchRows),
    categories: buildCategoryAggregates(categories, publishedRecipes),
    ingredients: buildIngredientAggregates(publishedRecipes),
    recipes: buildRecipeAggregates(publishedRecipes, fieldsByType),
    series: buildSeriesAggregates(seriesRows),
  };
}

/**
 * Compute Growth opportunities from loaded aggregates (no auth).
 */
export async function loadAdminGrowthOpportunitiesPayload(
  options: GrowthLoadOptions = {},
): Promise<GrowthOpportunitiesResult> {
  const now = options.now ?? new Date();
  const inputs = await loadGrowthOpportunityInputs({ ...options, now });
  const opportunities = buildGrowthOpportunities(inputs);
  return {
    opportunities,
    generatedAt: now.toISOString(),
    windowDays: GROWTH_SEARCH_WINDOW_DAYS,
    summary: summarizeOpportunities(opportunities),
  };
}

/**
 * Admin-facing entry: content access required, then fresh read-only computation.
 */
export async function getAdminGrowthOpportunities(
  options: Omit<GrowthLoadOptions, "db"> = {},
): Promise<GrowthOpportunitiesResult> {
  await requireAccess("content");
  return loadAdminGrowthOpportunitiesPayload(options);
}
