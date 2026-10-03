/**
 * Roadmap #13 Phase 13C — Growth Opportunities server aggregate loaders.
 * Local DB / mocks only. No Production. No writes under test assertion.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { canAccess } from "@/lib/admin-access";
import {
  GROWTH_SEARCH_WINDOW_DAYS,
  GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT,
  GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT,
} from "@/lib/growth-opportunities";
import {
  GROWTH_SEARCH_AGGREGATE_CANDIDATE_CAP,
  canViewGrowthOpportunities,
  loadAdminGrowthOpportunitiesPayload,
  loadGrowthOpportunityInputs,
} from "@/lib/growth-opportunities-server";

const root = path.dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(path.join(root, "growth-opportunities-server.ts"), "utf8");

const WRITE_ACTIONS = new Set([
  "create",
  "update",
  "delete",
  "upsert",
  "updateMany",
  "createMany",
  "deleteMany",
]);

const FORBIDDEN_MODELS = new Set([
  "user",
  "recipeSave",
  "userSeriesFollow",
  "userCategoryFollow",
  "mealPlan",
  "newsletterSubscriber",
  "adminAudit",
  "funnelEvent",
  "guestPageView",
  "searchConsole",
  "youTubeAnalyticsDayMetric",
  "youTubeVideoSnapshot",
  "youTubeChannelSnapshot",
]);

function createEmptyDb() {
  const labels: string[] = [];
  const db = {
    recipe: {
      findMany: async () => {
        labels.push("recipe.findMany");
        return [];
      },
    },
    category: {
      findMany: async () => {
        labels.push("category.findMany");
        return [];
      },
    },
    series: {
      findMany: async () => {
        labels.push("series.findMany");
        return [];
      },
    },
    searchEvent: {
      findMany: async (args: { select?: Record<string, boolean> }) => {
        labels.push("searchEvent.findMany");
        assert.equal(args.select?.visitorId, undefined);
        return [];
      },
    },
    recipeTypeField: {
      findMany: async () => {
        labels.push("recipeTypeField.findMany");
        return [];
      },
    },
  };
  return { db: db as unknown as ReturnType<typeof import("@/lib/db").getDb>, labels };
}

function createQueryProbe(db: PrismaClient) {
  const modelCalls: string[] = [];
  const writeCalls: string[] = [];
  const searchSelects: Array<Record<string, unknown> | undefined> = [];

  const handler: ProxyHandler<object> = {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string") return value;
      if (prop.startsWith("$") || prop === "then") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      if (value && typeof value === "object") {
        return new Proxy(value as object, {
          get(model, action) {
            const fn = Reflect.get(model, action as PropertyKey);
            if (typeof action !== "string" || typeof fn !== "function") return fn;
            return (...args: unknown[]) => {
              modelCalls.push(`${prop}.${action}`);
              if (WRITE_ACTIONS.has(action)) writeCalls.push(`${prop}.${action}`);
              if (FORBIDDEN_MODELS.has(prop)) {
                throw new Error(`Forbidden Growth model access: ${prop}.${action}`);
              }
              if (prop === "searchEvent" && action === "findMany") {
                const arg = args[0] as { select?: Record<string, unknown> } | undefined;
                searchSelects.push(arg?.select);
                assert.equal(arg?.select?.visitorId, undefined);
              }
              return (fn as (...a: unknown[]) => unknown).apply(model, args);
            };
          },
        });
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  };

  return {
    db: new Proxy(db, handler) as PrismaClient,
    modelCalls,
    writeCalls,
    searchSelects,
  };
}

function assertNoPii(serialized: string) {
  const lowered = serialized.toLowerCase();
  for (const token of [
    "visitorid",
    "userid",
    "subscriberid",
    '"email"',
    "token",
    '"ip"',
    "session",
  ]) {
    assert.equal(lowered.includes(token), false, `PII token present: ${token}`);
  }
}

describe("growth opportunities server — source contracts", () => {
  it("omits server-only import and does not wire UI/nav/feature gate", () => {
    assert.equal(/^import ["']server-only["']/m.test(serverSource), false);
    assert.equal(serverSource.includes("admin-nav"), false);
    assert.equal(serverSource.includes("ADMIN_GROWTH_OPPORTUNITIES_ENABLED"), false);
    assert.equal(serverSource.includes("app/admin/(app)/growth"), false);
    assert.match(serverSource, /requireAccess\(\s*["']content["']\s*\)/);
    assert.match(serverSource, /buildGrowthOpportunities/);
    assert.match(serverSource, /GROWTH_SEARCH_AGGREGATE_CANDIDATE_CAP\s*=\s*200/);
  });

  it("canViewGrowthOpportunities matches content access matrix", () => {
    assert.equal(canViewGrowthOpportunities("owner"), true);
    assert.equal(canViewGrowthOpportunities("editor"), true);
    assert.equal(canViewGrowthOpportunities("members"), false);
    assert.equal(canViewGrowthOpportunities("audience"), false);
    assert.equal(canViewGrowthOpportunities(""), false);
    assert.equal(canAccess("owner", "content"), canViewGrowthOpportunities("owner"));
    assert.equal(canAccess("editor", "content"), canViewGrowthOpportunities("editor"));
    assert.equal(canAccess("members", "content"), canViewGrowthOpportunities("members"));
  });

  it("R10 remains deferred in pure engine (server does not invent filter dead-end rule)", () => {
    assert.equal(serverSource.includes("search_filter_dead_end"), false);
  });
});

describe("growth opportunities server — empty / privacy / bounds", () => {
  it("empty database returns empty opportunities without typeField query", async () => {
    const { db, labels } = createEmptyDb();
    const now = new Date("2026-06-15T12:00:00.000Z");
    const result = await loadAdminGrowthOpportunitiesPayload({ db, now });
    assert.deepEqual(result.opportunities, []);
    assert.equal(result.windowDays, GROWTH_SEARCH_WINDOW_DAYS);
    assert.equal(result.generatedAt, now.toISOString());
    assert.equal(result.summary.total, 0);
    assert.deepEqual(labels.sort(), [
      "category.findMany",
      "recipe.findMany",
      "searchEvent.findMany",
      "series.findMany",
    ]);
  });

  it("query labels stay bounded when recipe count grows (mock)", async () => {
    const makeRecipes = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `r${i}`,
        title: `Recipe ${i}`,
        slug: `recipe-${i}`,
        status: "published",
        excerpt: "",
        publishedAt: new Date("2024-01-01T00:00:00.000Z"),
        relatedRecipeIds: "[]",
        values: "{}",
        typeId: "t1",
        type: { id: "t1", name: "Type" },
        categories: [],
        seriesItems: [],
        recipeIngredients: [],
      }));

    const buildDb = (n: number) => {
      const labels: string[] = [];
      return {
        labels,
        db: {
          recipe: {
            findMany: async () => {
              labels.push("recipe.findMany");
              return makeRecipes(n);
            },
          },
          category: {
            findMany: async () => {
              labels.push("category.findMany");
              return [];
            },
          },
          series: {
            findMany: async () => {
              labels.push("series.findMany");
              return [];
            },
          },
          searchEvent: {
            findMany: async () => {
              labels.push("searchEvent.findMany");
              return [];
            },
          },
          recipeTypeField: {
            findMany: async () => {
              labels.push("recipeTypeField.findMany");
              return [];
            },
          },
        } as unknown as ReturnType<typeof import("@/lib/db").getDb>,
      };
    };

    const small = buildDb(10);
    const large = buildDb(100);
    await loadGrowthOpportunityInputs({ db: small.db });
    await loadGrowthOpportunityInputs({ db: large.db });
    assert.deepEqual(small.labels, large.labels);
    assert.equal(small.labels.filter((l) => l === "recipe.findMany").length, 1);
    assert.equal(large.labels.length, small.labels.length);
  });

  it("search aggregation thresholds, window, display, and candidate cap", async () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const rows: Array<{ queryNorm: string; queryRaw: string }> = [];
    for (let i = 0; i < GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT; i += 1) {
      rows.push({ queryNorm: "air fryer chicken", queryRaw: "Air Fryer Chicken" });
    }
    for (let i = 0; i < GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT; i += 1) {
      rows.push({ queryNorm: "sourdough discard", queryRaw: "sourdough discard" });
    }
    // Below threshold
    rows.push({ queryNorm: "once", queryRaw: "once" });
    rows.push({ queryNorm: "twice", queryRaw: "twice" });

    // Cap pressure: many distinct norms at threshold
    for (let i = 0; i < GROWTH_SEARCH_AGGREGATE_CANDIDATE_CAP + 20; i += 1) {
      const norm = `cap-query-${String(i).padStart(3, "0")}`;
      for (let j = 0; j < GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT; j += 1) {
        rows.push({ queryNorm: norm, queryRaw: norm });
      }
    }

    const db = {
      recipe: { findMany: async () => [] },
      category: { findMany: async () => [] },
      series: { findMany: async () => [] },
      searchEvent: {
        findMany: async (args: {
          where?: { createdAt?: { gte?: Date; lt?: Date }; zeroResult?: boolean };
          select?: Record<string, boolean>;
        }) => {
          assert.equal(args.where?.zeroResult, true);
          assert.ok(args.where?.createdAt?.gte instanceof Date);
          assert.ok(args.where?.createdAt?.lt instanceof Date);
          assert.equal(args.select?.visitorId, undefined);
          assert.equal(args.select?.queryNorm, true);
          assert.equal(args.select?.queryRaw, true);
          return rows;
        },
      },
      recipeTypeField: { findMany: async () => [] },
    } as unknown as ReturnType<typeof import("@/lib/db").getDb>;

    const inputs = await loadGrowthOpportunityInputs({ db, now });
    assert.ok(inputs.searches);
    assert.ok(inputs.searches!.length <= GROWTH_SEARCH_AGGREGATE_CANDIDATE_CAP);
    const chicken = inputs.searches!.find((s) => s.queryNorm === "air fryer chicken");
    assert.ok(chicken);
    assert.equal(chicken!.zeroResultCount, GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT);
    assert.equal(chicken!.displayQuery, "Air Fryer Chicken");
    const discard = inputs.searches!.find((s) => s.queryNorm === "sourdough discard");
    assert.ok(discard);
    assert.equal(discard!.zeroResultCount, GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT);
    assert.equal(
      inputs.searches!.some((s) => s.queryNorm === "once" || s.queryNorm === "twice"),
      false,
    );

    const result = await loadAdminGrowthOpportunitiesPayload({ db, now });
    const r1 = result.opportunities.filter((o) => o.ruleId === "search_zero_repeat");
    assert.ok(r1.some((o) => o.entityId === "air fryer chicken" && o.priority === "medium"));
    assert.ok(r1.some((o) => o.entityId === "sourdough discard" && o.priority === "high"));
    assertNoPii(JSON.stringify(result));
  });
});

describe("growth opportunities server — local DB fixtures", { concurrency: false }, () => {
  const db = new PrismaClient();
  const suffix = `13c-${Date.now()}`;
  const prefix = `growth-${suffix}-`;
  const now = new Date("2026-06-15T12:00:00.000Z");

  let typeId = "";
  let catZeroId = "";
  let catZeroSlug = "";
  let catR2Id = "";
  let catR2Slug = "";
  let catR3Id = "";
  let catR3Slug = "";
  let ingredientId = "";
  let ingredientSlug = "";
  let recipeA = "";
  let recipeB = "";
  let recipeDraft = "";
  let recipeNoVideo = "";
  let recipeVideoNoTs = "";
  let recipeVideoTs = "";
  let recipeLinked = "";
  let recipeSuggestSource = "";
  let recipeSuggestTarget = "";
  let recipeReadyRec = "";
  let recipeRequiredOnly = "";
  let seriesThin0 = "";
  let seriesThin1 = "";
  let seriesOk = "";
  let seriesUnpub = "";
  let visitorId = "";
  const createdRecipeIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdSeriesIds: string[] = [];
  const createdIngredientIds: string[] = [];
  const createdSearchIds: string[] = [];

  before(async () => {
    await db.$connect();

    const type = await db.recipeType.create({
      data: { slug: `${prefix}type`, name: `Growth Type ${suffix}` },
    });
    typeId = type.id;

    const catZero = await db.category.create({
      data: {
        slug: `${prefix}zero`,
        name: `Zero Cat ${suffix}`,
        group: "course",
        description: "Has description but zero published recipes",
      },
    });
    catZeroId = catZero.id;
    catZeroSlug = catZero.slug;
    createdCategoryIds.push(catZeroId);

    const catR2 = await db.category.create({
      data: {
        slug: `${prefix}r2`,
        name: `R2 Cat ${suffix}`,
        group: "desserts",
        description: "",
      },
    });
    catR2Id = catR2.id;
    catR2Slug = catR2.slug;
    createdCategoryIds.push(catR2Id);

    const catR3 = await db.category.create({
      data: {
        slug: `${prefix}r3`,
        name: `R3 Cat ${suffix}`,
        group: "holiday",
        description: "   ",
      },
    });
    catR3Id = catR3.id;
    catR3Slug = catR3.slug;
    createdCategoryIds.push(catR3Id);

    const ingredient = await db.ingredient.create({
      data: {
        name: `${prefix} Yeast`,
        nameNorm: `${prefix}yeast`,
        slug: `${prefix}yeast`,
      },
    });
    ingredientId = ingredient.id;
    ingredientSlug = ingredient.slug;
    createdIngredientIds.push(ingredientId);

    async function createRecipe(input: {
      slug: string;
      title: string;
      status?: string;
      excerpt?: string;
      values?: Record<string, unknown>;
    }) {
      const row = await db.recipe.create({
        data: {
          slug: `${prefix}${input.slug}`,
          title: input.title,
          typeId,
          status: input.status ?? "published",
          publishedAt:
            (input.status ?? "published") === "published"
              ? new Date("2024-01-01T00:00:00.000Z")
              : null,
          excerpt: input.excerpt ?? "",
          values: JSON.stringify(input.values ?? {}),
        },
      });
      createdRecipeIds.push(row.id);
      return row.id;
    }

    recipeA = await createRecipe({ slug: "a", title: `Growth A ${suffix}` });
    recipeB = await createRecipe({ slug: "b", title: `Growth B ${suffix}` });
    recipeDraft = await createRecipe({
      slug: "draft",
      title: `Growth Draft ${suffix}`,
      status: "draft",
    });

    // Ingredient twice in A, once in B, once in Draft → distinct published = 2 → R4
    await db.recipeIngredient.createMany({
      data: [
        {
          recipeId: recipeA,
          ingredientId,
          groupIndex: 0,
          itemIndex: 0,
          authoredItem: `${prefix} Yeast`,
          authoredItemNorm: `${prefix}yeast`,
          matchedVia: "EXACT",
        },
        {
          recipeId: recipeA,
          ingredientId,
          groupIndex: 0,
          itemIndex: 1,
          authoredItem: `${prefix} Yeast`,
          authoredItemNorm: `${prefix}yeast`,
          matchedVia: "EXACT",
        },
        {
          recipeId: recipeB,
          ingredientId,
          groupIndex: 0,
          itemIndex: 0,
          authoredItem: `${prefix} Yeast`,
          authoredItemNorm: `${prefix}yeast`,
          matchedVia: "EXACT",
        },
        {
          recipeId: recipeDraft,
          ingredientId,
          groupIndex: 0,
          itemIndex: 0,
          authoredItem: `${prefix} Yeast`,
          authoredItemNorm: `${prefix}yeast`,
          matchedVia: "EXACT",
        },
      ],
    });

    // catR2: 2 published → R2 only (blank description ignored while below indexable)
    await db.recipeCategory.create({ data: { recipeId: recipeA, categoryId: catR2Id } });
    await db.recipeCategory.create({ data: { recipeId: recipeB, categoryId: catR2Id } });

    // catR3: 3 published + blank description → R3 only
    const r3a = await createRecipe({ slug: "r3a", title: `R3 A ${suffix}` });
    const r3b = await createRecipe({ slug: "r3b", title: `R3 B ${suffix}` });
    const r3c = await createRecipe({ slug: "r3c", title: `R3 C ${suffix}` });
    await db.recipeCategory.create({ data: { recipeId: r3a, categoryId: catR3Id } });
    await db.recipeCategory.create({ data: { recipeId: r3b, categoryId: catR3Id } });
    await db.recipeCategory.create({ data: { recipeId: r3c, categoryId: catR3Id } });

    recipeNoVideo = await createRecipe({
      slug: "no-video",
      title: `No Video ${suffix}`,
      values: { dishName: `No Video ${suffix}` },
    });
    recipeVideoNoTs = await createRecipe({
      slug: "video-no-ts",
      title: `Video No Ts ${suffix}`,
      values: {
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        instructions: [{ title: "Steps", steps: ["Mix", "Bake"], stepVideoTimestamps: [] }],
      },
    });
    recipeVideoTs = await createRecipe({
      slug: "video-ts",
      title: `Video Ts ${suffix}`,
      values: {
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        instructions: [
          {
            title: "Steps",
            steps: ["Mix", "Bake"],
            stepVideoTimestamps: [10, 40],
          },
        ],
      },
    });
    // Draft no video → no R6
    await createRecipe({
      slug: "draft-no-video",
      title: `Draft No Video ${suffix}`,
      status: "draft",
      values: {},
    });

    // Contextual links: zero → R5; one accepted → no R5; malformed ignored
    recipeLinked = await createRecipe({
      slug: "linked",
      title: `Linked ${suffix}`,
      values: {
        contextualInternalLinks: [
          { recipeId: recipeA },
          { recipeId: "not-a-valid" }, // still counts as accepted id string if non-empty
          "bogus",
          null,
          { recipeId: "" },
        ],
      },
    });
    // Fix: only recipeA is accepted valid shape; "not-a-valid" and "bogus" are non-empty ids
    // so getContextualInternalLinkIds will count them. Use only malformed + one valid.
    await db.recipe.update({
      where: { id: recipeLinked },
      data: {
        values: JSON.stringify({
          contextualInternalLinks: [
            { recipeId: recipeA },
            null,
            { recipeId: "" },
            12,
            {},
          ],
        }),
      },
    });

    // #11 enrichment: shared Series → suggestion exists
    const suggestSeries = await db.series.create({
      data: {
        slug: `${prefix}suggest-series`,
        title: `Suggest Series ${suffix}`,
        isPublished: true,
      },
    });
    createdSeriesIds.push(suggestSeries.id);
    recipeSuggestSource = await createRecipe({
      slug: "suggest-source",
      title: `Suggest Source ${suffix}`,
      values: { contextualInternalLinks: [] },
    });
    recipeSuggestTarget = await createRecipe({
      slug: "suggest-target",
      title: `Suggest Target ${suffix}`,
      values: {},
    });
    await db.seriesItem.create({
      data: { seriesId: suggestSeries.id, recipeId: recipeSuggestSource, sortOrder: 0 },
    });
    await db.seriesItem.create({
      data: { seriesId: suggestSeries.id, recipeId: recipeSuggestTarget, sortOrder: 1 },
    });

    // Readiness: recommended missing (no excerpt/image) vs required failure only
    recipeReadyRec = await createRecipe({
      slug: "ready-rec",
      title: `Ready Rec ${suffix}`,
      excerpt: "",
      values: {},
    });
    recipeRequiredOnly = await createRecipe({
      slug: "required-only",
      title: `Required Only ${suffix}`,
      excerpt: "Has excerpt",
      values: {
        youtubeUrl: "https://example.com/not-youtube",
        prepMinutes: 10,
        servings: 4,
        image: "/uploads/test.jpg",
      },
    });

    // Series depth
    const s0 = await db.series.create({
      data: {
        slug: `${prefix}thin0`,
        title: `Thin0 ${suffix}`,
        isPublished: true,
      },
    });
    seriesThin0 = s0.id;
    createdSeriesIds.push(seriesThin0);

    const s1 = await db.series.create({
      data: {
        slug: `${prefix}thin1`,
        title: `Thin1 ${suffix}`,
        isPublished: true,
      },
    });
    seriesThin1 = s1.id;
    createdSeriesIds.push(seriesThin1);
    await db.seriesItem.create({
      data: { seriesId: seriesThin1, recipeId: recipeA, sortOrder: 0 },
    });
    // Draft member must not count
    await db.seriesItem.create({
      data: { seriesId: seriesThin1, recipeId: recipeDraft, sortOrder: 1 },
    });
    // Video-only item must not count
    await db.seriesItem.create({
      data: {
        seriesId: seriesThin1,
        recipeId: null,
        youtubeVideoId: null,
        sortOrder: 2,
      },
    });

    const sOk = await db.series.create({
      data: {
        slug: `${prefix}ok`,
        title: `Ok Series ${suffix}`,
        isPublished: true,
      },
    });
    seriesOk = sOk.id;
    createdSeriesIds.push(seriesOk);
    await db.seriesItem.create({
      data: { seriesId: seriesOk, recipeId: recipeA, sortOrder: 0 },
    });
    await db.seriesItem.create({
      data: { seriesId: seriesOk, recipeId: recipeB, sortOrder: 1 },
    });

    const sUnpub = await db.series.create({
      data: {
        slug: `${prefix}unpub`,
        title: `Unpub ${suffix}`,
        isPublished: false,
      },
    });
    seriesUnpub = sUnpub.id;
    createdSeriesIds.push(seriesUnpub);

    const visitor = await db.guestVisitor.create({
      data: { visitorKey: `${prefix}visitor` },
    });
    visitorId = visitor.id;

    async function addSearch(input: {
      queryNorm: string;
      queryRaw: string;
      zeroResult: boolean;
      createdAt: Date;
    }) {
      const row = await db.searchEvent.create({
        data: {
          visitorId,
          queryNorm: input.queryNorm,
          queryRaw: input.queryRaw,
          resultCount: input.zeroResult ? 0 : 3,
          zeroResult: input.zeroResult,
          placement: "recipes_catalog",
          filters: "{}",
          createdAt: input.createdAt,
        },
      });
      createdSearchIds.push(row.id);
    }

    const qNorm = `${prefix}zero-query`;
    for (let i = 0; i < GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT; i += 1) {
      await addSearch({
        queryNorm: qNorm,
        queryRaw: i === 0 ? `${prefix}Zero Query` : qNorm,
        zeroResult: true,
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      });
    }
    // Older than window — ignored
    await addSearch({
      queryNorm: qNorm,
      queryRaw: qNorm,
      zeroResult: true,
      createdAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
    });
    // Non-zero — ignored for zero-result count
    await addSearch({
      queryNorm: qNorm,
      queryRaw: qNorm,
      zeroResult: false,
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    });

    const highNorm = `${prefix}high-query`;
    for (let i = 0; i < GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT; i += 1) {
      await addSearch({
        queryNorm: highNorm,
        queryRaw: highNorm,
        zeroResult: true,
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      });
    }
  });

  after(async () => {
    if (createdSearchIds.length) {
      await db.searchEvent.deleteMany({ where: { id: { in: createdSearchIds } } }).catch(() => undefined);
    }
    if (visitorId) {
      await db.guestVisitor.delete({ where: { id: visitorId } }).catch(() => undefined);
    }
    if (createdSeriesIds.length) {
      await db.seriesItem.deleteMany({ where: { seriesId: { in: createdSeriesIds } } }).catch(() => undefined);
      await db.series.deleteMany({ where: { id: { in: createdSeriesIds } } }).catch(() => undefined);
    }
    if (createdRecipeIds.length) {
      await db.recipeIngredient.deleteMany({ where: { recipeId: { in: createdRecipeIds } } }).catch(() => undefined);
      await db.recipeCategory.deleteMany({ where: { recipeId: { in: createdRecipeIds } } }).catch(() => undefined);
      await db.recipe.deleteMany({ where: { id: { in: createdRecipeIds } } }).catch(() => undefined);
    }
    if (createdIngredientIds.length) {
      await db.ingredient.deleteMany({ where: { id: { in: createdIngredientIds } } }).catch(() => undefined);
    }
    if (createdCategoryIds.length) {
      await db.category.deleteMany({ where: { id: { in: createdCategoryIds } } }).catch(() => undefined);
    }
    if (typeId) {
      await db.recipeType.delete({ where: { id: typeId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  it("category zero / R2 / R3 mutual exclusion", async () => {
    const probe = createQueryProbe(db);
    const result = await loadAdminGrowthOpportunitiesPayload({
      db: probe.db as unknown as ReturnType<typeof import("@/lib/db").getDb>,
      now,
    });

    const byEntity = (ruleId: string, entityId: string) =>
      result.opportunities.find((o) => o.ruleId === ruleId && o.entityId === entityId);

    assert.ok(byEntity("category_below_indexable", catZeroSlug));
    assert.ok(byEntity("category_below_indexable", catR2Slug));
    assert.equal(byEntity("category_empty_indexable_description", catR2Slug), undefined);
    assert.ok(byEntity("category_empty_indexable_description", catR3Slug));
    assert.equal(byEntity("category_below_indexable", catR3Slug), undefined);

    const inputs = await loadGrowthOpportunityInputs({
      db: probe.db as unknown as ReturnType<typeof import("@/lib/db").getDb>,
      now,
    });
    const zeroCat = inputs.categories?.find((c) => c.id === catZeroId);
    assert.ok(zeroCat);
    assert.equal(zeroCat!.publishedRecipeCount, 0);
  });

  it("ingredient distinct count → R4 once; draft excluded", async () => {
    const inputs = await loadGrowthOpportunityInputs({ db, now });
    const near = inputs.ingredients?.filter((i) => i.id === ingredientId) ?? [];
    assert.equal(near.length, 1, `expected near-indexable ingredient DTO, got ${JSON.stringify(inputs.ingredients?.filter((i) => i.slug.includes(prefix)))}`);
    assert.equal(near[0]!.publishedRecipeCount, 2);

    const result = await loadAdminGrowthOpportunitiesPayload({ db, now });
    const r4 = result.opportunities.filter(
      (o) => o.ruleId === "ingredient_near_indexable" && o.entityId === ingredientSlug,
    );
    assert.equal(r4.length, 1);
  });

  it("video / timestamps / draft exclusion", async () => {
    const result = await loadAdminGrowthOpportunitiesPayload({ db, now });
    assert.ok(
      result.opportunities.some(
        (o) => o.ruleId === "recipe_missing_youtube" && o.entityId === recipeNoVideo,
      ),
    );
    assert.ok(
      result.opportunities.some(
        (o) =>
          o.ruleId === "recipe_youtube_missing_timestamps" && o.entityId === recipeVideoNoTs,
      ),
    );
    assert.equal(
      result.opportunities.some(
        (o) =>
          (o.ruleId === "recipe_missing_youtube" ||
            o.ruleId === "recipe_youtube_missing_timestamps") &&
          o.entityId === recipeVideoTs,
      ),
      false,
    );
    assert.equal(
      result.opportunities.some(
        (o) => o.ruleId === "recipe_missing_youtube" && o.entityId === recipeDraft,
      ),
      false,
    );
  });

  it("contextual links + #11 enrichment boolean only", async () => {
    const inputs = await loadGrowthOpportunityInputs({ db, now });
    const linked = inputs.recipes?.find((r) => r.id === recipeLinked);
    assert.ok(linked);
    assert.equal(linked!.contextualLinkCount, 1);

    const source = inputs.recipes?.find((r) => r.id === recipeSuggestSource);
    assert.ok(source);
    assert.equal(source!.contextualLinkCount, 0);
    assert.equal(source!.hasContextualSuggestion, true);

    const result = await loadAdminGrowthOpportunitiesPayload({ db, now });
    const r5 = result.opportunities.find(
      (o) => o.ruleId === "recipe_zero_contextual_links" && o.entityId === recipeSuggestSource,
    );
    assert.ok(r5);
    assert.equal(r5!.priority, "high");
    const blob = JSON.stringify(result);
    assert.equal(blob.includes('"score"'), false);
    assert.equal(blob.toLowerCase().includes("reasonkind"), false);
  });

  it("readiness recommended-only normalization", async () => {
    const inputs = await loadGrowthOpportunityInputs({ db, now });
    const rec = inputs.recipes?.find((r) => r.id === recipeReadyRec);
    assert.ok(rec);
    assert.ok(rec!.failedRecommendedChecks.length > 0);
    assert.ok(rec!.failedRecommendedChecks.every((c) => c.id && c.label));

    const requiredOnly = inputs.recipes?.find((r) => r.id === recipeRequiredOnly);
    assert.ok(requiredOnly);
    // Malformed youtube is required — must not appear in failedRecommendedChecks as youtube_url
    assert.equal(
      requiredOnly!.failedRecommendedChecks.some((c) => c.id === "recipe.youtube_url"),
      false,
    );

    const result = await loadAdminGrowthOpportunitiesPayload({ db, now });
    assert.ok(
      result.opportunities.some(
        (o) =>
          o.ruleId === "published_readiness_recommendations" && o.entityId === recipeReadyRec,
      ),
    );
  });

  it("series thin published semantics", async () => {
    const result = await loadAdminGrowthOpportunitiesPayload({ db, now });
    assert.ok(
      result.opportunities.some(
        (o) => o.ruleId === "series_thin_published" && o.entityId === seriesThin0,
      ),
    );
    assert.ok(
      result.opportunities.some(
        (o) => o.ruleId === "series_thin_published" && o.entityId === seriesThin1,
      ),
    );
    assert.equal(
      result.opportunities.some(
        (o) => o.ruleId === "series_thin_published" && o.entityId === seriesOk,
      ),
      false,
    );
    assert.equal(
      result.opportunities.some(
        (o) => o.ruleId === "series_thin_published" && o.entityId === seriesUnpub,
      ),
      false,
    );
  });

  it("search window integration + no visitor in output", async () => {
    const result = await loadAdminGrowthOpportunitiesPayload({ db, now });
    const medium = result.opportunities.find(
      (o) => o.ruleId === "search_zero_repeat" && o.entityId === `${prefix}zero-query`,
    );
    const high = result.opportunities.find(
      (o) => o.ruleId === "search_zero_repeat" && o.entityId === `${prefix}high-query`,
    );
    assert.ok(medium);
    assert.equal(medium!.priority, "medium");
    assert.ok(high);
    assert.equal(high!.priority, "high");
    assertNoPii(JSON.stringify(result));
    assert.equal(JSON.stringify(result).includes(visitorId), false);
  });

  it("malformed optional recipe JSON does not crash Growth", async () => {
    const bad = await db.recipe.create({
      data: {
        slug: `${prefix}malformed`,
        title: `Malformed ${suffix}`,
        typeId,
        status: "published",
        publishedAt: new Date("2024-01-01T00:00:00.000Z"),
        values: JSON.stringify({
          contextualInternalLinks: "not-json-array",
          youtubeUrl: "not-a-url",
          instructions: [{ steps: ["a"], stepVideoTimestamps: ["x", null, 1.5, -1] }],
        }),
      },
    });
    const badId = bad.id;
    createdRecipeIds.push(badId);
    await assert.doesNotReject(() => loadAdminGrowthOpportunitiesPayload({ db, now }));
    const inputs = await loadGrowthOpportunityInputs({ db, now });
    const row = inputs.recipes?.find((r) => r.id === badId);
    assert.ok(row);
    assert.equal(row!.contextualLinkCount, 0);
    assert.equal(row!.hasUsableYouTube, false);
    assert.equal(row!.stepTimestampCount, 0);
  });

  it("no-write + forbidden model + search select privacy on full load", async () => {
    const probe = createQueryProbe(db);
    await loadAdminGrowthOpportunitiesPayload({
      db: probe.db as unknown as ReturnType<typeof import("@/lib/db").getDb>,
      now,
      onQuery: () => undefined,
    });
    assert.deepEqual(probe.writeCalls, []);
    assert.ok(probe.modelCalls.includes("recipe.findMany"));
    assert.ok(probe.modelCalls.includes("category.findMany"));
    assert.ok(probe.modelCalls.includes("series.findMany"));
    assert.ok(probe.modelCalls.includes("searchEvent.findMany"));
    assert.equal(probe.modelCalls.some((c) => c.startsWith("user.")), false);
    assert.equal(probe.modelCalls.some((c) => c.startsWith("recipeSave.")), false);
    assert.equal(probe.modelCalls.some((c) => c.startsWith("mealPlan.")), false);
    assert.equal(probe.modelCalls.some((c) => c.startsWith("newsletterSubscriber.")), false);
    assert.equal(probe.searchSelects.length >= 1, true);
    for (const select of probe.searchSelects) {
      assert.ok(select);
      assert.equal("visitorId" in (select ?? {}), false);
      assert.equal("filters" in (select ?? {}), false);
    }
    // Bounded: findMany counts do not scale with fixture recipe count beyond fixed labels
    const recipeFinds = probe.modelCalls.filter((c) => c === "recipe.findMany").length;
    assert.equal(recipeFinds, 1);
  });
});
