/**
 * Roadmap #13 Phase 13B — Growth Opportunities pure rule engine tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CATEGORY_INDEXABLE_MIN_RECIPES } from "@/lib/category-seo";
import { INGREDIENT_INDEXABLE_MIN_RECIPES } from "@/lib/ingredient-seo";
import {
  GROWTH_INGREDIENT_NEAR_INDEXABLE_COUNT,
  GROWTH_OPPORTUNITY_RULE_IDS,
  GROWTH_OPPORTUNITY_TYPE_LABELS,
  GROWTH_READINESS_EVIDENCE_CAP,
  GROWTH_SEARCH_WINDOW_DAYS,
  GROWTH_THIN_SERIES_MAX_PUBLISHED_RECIPES,
  GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT,
  GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT,
  buildGrowthOpportunities,
  buildGrowthOpportunityId,
  compareGrowthOpportunities,
  dedupeGrowthOpportunities,
  getCategoryBelowIndexableOpportunity,
  getCategoryEmptyIndexableDescriptionOpportunity,
  getIngredientNearIndexableOpportunity,
  getRecipeContextualLinkOpportunity,
  getRecipeMissingYoutubeOpportunity,
  getRecipeReadinessOpportunity,
  getRecipeYoutubeMissingTimestampsOpportunity,
  getSearchZeroRepeatOpportunity,
  getSeriesThinPublishedOpportunity,
  sortGrowthOpportunities,
  type GrowthCategoryAggregate,
  type GrowthIngredientAggregate,
  type GrowthOpportunity,
  type GrowthRecipeAggregate,
  type GrowthSearchAggregate,
  type GrowthSeriesAggregate,
} from "@/lib/growth-opportunities";

const here = path.dirname(fileURLToPath(import.meta.url));
const growthSource = readFileSync(path.join(here, "growth-opportunities.ts"), "utf8");

function search(partial: Partial<GrowthSearchAggregate>): GrowthSearchAggregate {
  return {
    queryNorm: "air fryer chicken",
    displayQuery: "air fryer chicken",
    zeroResultCount: 0,
    windowDays: GROWTH_SEARCH_WINDOW_DAYS,
    ...partial,
  };
}

function category(partial: Partial<GrowthCategoryAggregate>): GrowthCategoryAggregate {
  return {
    id: "cat-1",
    slug: "breads",
    name: "Breads",
    group: "course",
    description: "Bread recipes",
    publishedRecipeCount: 0,
    ...partial,
  };
}

function ingredient(partial: Partial<GrowthIngredientAggregate>): GrowthIngredientAggregate {
  return {
    id: "ing-1",
    slug: "yeast",
    name: "Yeast",
    publishedRecipeCount: 0,
    ...partial,
  };
}

function recipe(partial: Partial<GrowthRecipeAggregate>): GrowthRecipeAggregate {
  return {
    id: "recipe-1",
    title: "Chocolate Chunk Cookies",
    isPublished: true,
    contextualLinkCount: 1,
    hasUsableYouTube: true,
    stepTimestampCount: 3,
    failedRecommendedChecks: [],
    ...partial,
  };
}

function series(partial: Partial<GrowthSeriesAggregate>): GrowthSeriesAggregate {
  return {
    id: "series-1",
    name: "Breads",
    isPublished: true,
    publishedRecipeMemberCount: 0,
    ...partial,
  };
}

function assertNoPii(value: unknown) {
  const json = JSON.stringify(value);
  for (const needle of [
    "visitorId",
    "userId",
    "subscriberId",
    "email",
    "@gmail",
    "ipAddress",
    "token",
  ]) {
    assert.equal(json.includes(needle), false, `unexpected PII marker: ${needle}`);
  }
}

describe("growth-opportunities — domain foundation", () => {
  it("locks taxonomy labels and rule ids", () => {
    assert.equal(GROWTH_OPPORTUNITY_TYPE_LABELS.search_demand, "Search Demand");
    assert.equal(GROWTH_OPPORTUNITY_TYPE_LABELS.seo_coverage, "SEO / Coverage");
    assert.equal(GROWTH_OPPORTUNITY_RULE_IDS.length, 9);
    assert.ok(GROWTH_OPPORTUNITY_RULE_IDS.includes("search_zero_repeat"));
    assert.ok(!GROWTH_OPPORTUNITY_RULE_IDS.includes("search_filter_dead_end"));
  });

  it("reuses verified SEO indexability thresholds", () => {
    assert.equal(CATEGORY_INDEXABLE_MIN_RECIPES, 3);
    assert.equal(INGREDIENT_INDEXABLE_MIN_RECIPES, 3);
    assert.equal(GROWTH_INGREDIENT_NEAR_INDEXABLE_COUNT, 2);
    assert.equal(GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT, 3);
    assert.equal(GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT, 10);
    assert.equal(GROWTH_SEARCH_WINDOW_DAYS, 28);
    assert.equal(GROWTH_THIN_SERIES_MAX_PUBLISHED_RECIPES, 1);
  });

  it("builds stable opportunity ids", () => {
    const a = buildGrowthOpportunityId("search_zero_repeat", "search_query", "air fryer chicken");
    const b = buildGrowthOpportunityId("search_zero_repeat", "search_query", "air fryer chicken");
    const c = buildGrowthOpportunityId("category_below_indexable", "category", "breads");
    const d = buildGrowthOpportunityId("recipe_missing_youtube", "recipe", "recipe-1");
    assert.equal(a, b);
    assert.equal(a, "search_zero_repeat:search_query:air fryer chicken");
    assert.notEqual(a, c);
    assert.equal(d, "recipe_missing_youtube:recipe:recipe-1");
  });
});

describe("growth-opportunities — R1 search_zero_repeat", () => {
  it("skips below threshold, empty query, and wrong window", () => {
    assert.equal(getSearchZeroRepeatOpportunity(search({ zeroResultCount: 0 })), null);
    assert.equal(getSearchZeroRepeatOpportunity(search({ zeroResultCount: 2 })), null);
    assert.equal(getSearchZeroRepeatOpportunity(search({ queryNorm: "  " })), null);
    assert.equal(
      getSearchZeroRepeatOpportunity(search({ zeroResultCount: 5, windowDays: 7 })),
      null,
    );
  });

  it("emits medium for 3–9 and high for 10+", () => {
    const medium = getSearchZeroRepeatOpportunity(search({ zeroResultCount: 3 }));
    assert.equal(medium?.priority, "medium");
    assert.equal(medium?.evidenceStrength, 3);
    assert.match(medium!.evidence[0]!, /3 times in the last 28 days/);
    assert.equal(medium?.href, "/admin/search");

    const midHigh = getSearchZeroRepeatOpportunity(search({ zeroResultCount: 9 }));
    assert.equal(midHigh?.priority, "medium");

    const high = getSearchZeroRepeatOpportunity(search({ zeroResultCount: 10 }));
    assert.equal(high?.priority, "high");
    assert.equal(high?.windowDays, 28);
    assertNoPii(high);
  });
});

describe("growth-opportunities — R2 category_below_indexable", () => {
  it("fires for 0/1/2 and not for >=3", () => {
    assert.ok(getCategoryBelowIndexableOpportunity(category({ publishedRecipeCount: 0 })));
    assert.ok(getCategoryBelowIndexableOpportunity(category({ publishedRecipeCount: 1 })));
    assert.ok(getCategoryBelowIndexableOpportunity(category({ publishedRecipeCount: 2 })));
    assert.equal(
      getCategoryBelowIndexableOpportunity(category({ publishedRecipeCount: 3 })),
      null,
    );
    assert.equal(
      getCategoryBelowIndexableOpportunity(category({ publishedRecipeCount: 4 })),
      null,
    );
  });

  it("resolves zero vs near-indexable priority and evidence", () => {
    const zero = getCategoryBelowIndexableOpportunity(
      category({ publishedRecipeCount: 0, group: "course" }),
    );
    assert.equal(zero?.priority, "medium");
    assert.match(zero!.evidence.join(" "), /no Published Recipes/);
    assert.doesNotMatch(zero!.evidence.join(" "), /one .* away|1 Published/);

    const followable = getCategoryBelowIndexableOpportunity(
      category({ publishedRecipeCount: 2, group: "desserts" }),
    );
    assert.equal(followable?.priority, "high");
    assert.match(followable!.evidence[0]!, /2 Published Recipes/);

    const method = getCategoryBelowIndexableOpportunity(
      category({
        slug: "stovetop",
        name: "Stovetop",
        group: "method",
        publishedRecipeCount: 1,
      }),
    );
    assert.equal(method?.priority, "medium");
  });
});

describe("growth-opportunities — R3 category_empty_indexable_description", () => {
  it("requires indexable count and blank description", () => {
    assert.equal(
      getCategoryEmptyIndexableDescriptionOpportunity(
        category({ publishedRecipeCount: 2, description: "" }),
      ),
      null,
    );
    assert.equal(
      getCategoryEmptyIndexableDescriptionOpportunity(
        category({ publishedRecipeCount: 3, description: "Has text" }),
      ),
      null,
    );
    const blank = getCategoryEmptyIndexableDescriptionOpportunity(
      category({ publishedRecipeCount: 3, description: "   " }),
    );
    assert.equal(blank?.priority, "low");
    assert.match(blank!.evidence[0]!, /indexable, but has no description/);
  });

  it("is mutually exclusive with below-indexable for the same category", () => {
    const thin = category({ publishedRecipeCount: 1, description: "" });
    assert.ok(getCategoryBelowIndexableOpportunity(thin));
    assert.equal(getCategoryEmptyIndexableDescriptionOpportunity(thin), null);

    const indexable = category({ publishedRecipeCount: 3, description: "" });
    assert.equal(getCategoryBelowIndexableOpportunity(indexable), null);
    assert.ok(getCategoryEmptyIndexableDescriptionOpportunity(indexable));
  });
});

describe("growth-opportunities — R4 ingredient_near_indexable", () => {
  it("fires only for distinct count === 2", () => {
    assert.equal(getIngredientNearIndexableOpportunity(ingredient({ publishedRecipeCount: 0 })), null);
    assert.equal(getIngredientNearIndexableOpportunity(ingredient({ publishedRecipeCount: 1 })), null);
    const near = getIngredientNearIndexableOpportunity(ingredient({ publishedRecipeCount: 2 }));
    assert.equal(near?.priority, "medium");
    assert.match(near!.evidence[0]!, /Appears in 2 Published Recipes/);
    assert.equal(getIngredientNearIndexableOpportunity(ingredient({ publishedRecipeCount: 3 })), null);
  });
});

describe("growth-opportunities — R5 contextual links", () => {
  it("requires published + zero links; suggestion raises priority", () => {
    assert.equal(
      getRecipeContextualLinkOpportunity(recipe({ isPublished: false, contextualLinkCount: 0 })),
      null,
    );
    assert.equal(
      getRecipeContextualLinkOpportunity(recipe({ contextualLinkCount: 1 })),
      null,
    );
    const medium = getRecipeContextualLinkOpportunity(recipe({ contextualLinkCount: 0 }));
    assert.equal(medium?.priority, "medium");
    assert.doesNotMatch(medium!.evidence.join(" "), /\bscore\b/i);

    const high = getRecipeContextualLinkOpportunity(
      recipe({ contextualLinkCount: 0, hasContextualSuggestion: true }),
    );
    assert.equal(high?.priority, "high");
    assert.match(high!.evidence.join(" "), /eligible candidate/);
  });
});

describe("growth-opportunities — R6/R7 video mutual exclusion", () => {
  it("emits R6 only when no YouTube", () => {
    const row = recipe({ hasUsableYouTube: false, stepTimestampCount: 0 });
    const missing = getRecipeMissingYoutubeOpportunity(row);
    const timestamps = getRecipeYoutubeMissingTimestampsOpportunity(row);
    assert.equal(missing?.priority, "medium");
    assert.equal(timestamps, null);
  });

  it("emits R7 only when YouTube present without timestamps", () => {
    const row = recipe({ hasUsableYouTube: true, stepTimestampCount: 0 });
    assert.equal(getRecipeMissingYoutubeOpportunity(row), null);
    assert.equal(getRecipeYoutubeMissingTimestampsOpportunity(row)?.priority, "high");
  });

  it("emits neither when video + timestamps; drafts never fire", () => {
    const healthy = recipe({ hasUsableYouTube: true, stepTimestampCount: 2 });
    assert.equal(getRecipeMissingYoutubeOpportunity(healthy), null);
    assert.equal(getRecipeYoutubeMissingTimestampsOpportunity(healthy), null);

    const draft = recipe({
      isPublished: false,
      hasUsableYouTube: false,
      stepTimestampCount: 0,
    });
    assert.equal(getRecipeMissingYoutubeOpportunity(draft), null);
    assert.equal(getRecipeYoutubeMissingTimestampsOpportunity(draft), null);
  });
});

describe("growth-opportunities — R8 series_thin_published", () => {
  it("only published Series with <=1 Published Recipe members", () => {
    assert.equal(
      getSeriesThinPublishedOpportunity(series({ isPublished: false, publishedRecipeMemberCount: 0 })),
      null,
    );
    const zero = getSeriesThinPublishedOpportunity(series({ publishedRecipeMemberCount: 0 }));
    assert.equal(zero?.priority, "medium");
    const one = getSeriesThinPublishedOpportunity(series({ publishedRecipeMemberCount: 1 }));
    assert.equal(one?.priority, "medium");
    assert.equal(
      getSeriesThinPublishedOpportunity(series({ publishedRecipeMemberCount: 2 })),
      null,
    );
  });
});

describe("growth-opportunities — R9 published_readiness_recommendations", () => {
  it("requires published + recommended failures; caps evidence", () => {
    assert.equal(
      getRecipeReadinessOpportunity(recipe({ failedRecommendedChecks: [] })),
      null,
    );
    assert.equal(
      getRecipeReadinessOpportunity(
        recipe({
          isPublished: false,
          failedRecommendedChecks: [{ id: "recipe.excerpt", label: "Add an excerpt" }],
        }),
      ),
      null,
    );

    const one = getRecipeReadinessOpportunity(
      recipe({
        failedRecommendedChecks: [{ id: "recipe.excerpt", label: "Add an excerpt" }],
      }),
    );
    assert.equal(one?.priority, "medium");
    assert.match(one!.evidence[0]!, /Recommended improvement: Add an excerpt/);
    assert.doesNotMatch(one!.evidence.join(" "), /\berror\b/i);

    const many = getRecipeReadinessOpportunity(
      recipe({
        failedRecommendedChecks: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
          { id: "c", label: "C" },
          { id: "d", label: "D" },
        ],
      }),
    );
    assert.equal(many!.evidence.length, GROWTH_READINESS_EVIDENCE_CAP + 1);
    assert.match(many!.evidence.at(-1)!, /1 more recommended/);
  });
});

describe("growth-opportunities — sort / dedupe / orchestrator", () => {
  it("sorts priority then evidenceStrength then title then id", () => {
    const mixed: GrowthOpportunity[] = [
      {
        id: "z",
        ruleId: "recipe_missing_youtube",
        type: "video",
        priority: "medium",
        priorityReason: "m",
        title: "B title",
        evidence: ["e"],
        actionLabel: "Open Recipe",
        href: "/admin/recipes/b",
        entityType: "recipe",
        entityId: "b",
        evidenceStrength: 1,
      },
      {
        id: "a",
        ruleId: "search_zero_repeat",
        type: "search_demand",
        priority: "high",
        priorityReason: "h",
        title: "A title",
        evidence: ["e"],
        actionLabel: "Review search coverage",
        href: "/admin/search",
        entityType: "search_query",
        entityId: "q",
        evidenceStrength: 12,
      },
      {
        id: "m2",
        ruleId: "search_zero_repeat",
        type: "search_demand",
        priority: "medium",
        priorityReason: "m",
        title: "A title",
        evidence: ["e"],
        actionLabel: "Review search coverage",
        href: "/admin/search",
        entityType: "search_query",
        entityId: "q2",
        evidenceStrength: 5,
      },
      {
        id: "low",
        ruleId: "category_empty_indexable_description",
        type: "seo_coverage",
        priority: "low",
        priorityReason: "l",
        title: "C title",
        evidence: ["e"],
        actionLabel: "Open category",
        href: "/admin/categories",
        entityType: "category",
        entityId: "c",
      },
    ];
    const sorted = sortGrowthOpportunities(mixed);
    assert.deepEqual(
      sorted.map((row) => row.id),
      ["a", "m2", "z", "low"],
    );
    assert.equal(compareGrowthOpportunities(sorted[0]!, sorted[1]!), -1);
    assert.deepEqual(
      sortGrowthOpportunities(mixed).map((row) => row.id),
      sorted.map((row) => row.id),
    );
  });

  it("dedupes same rule/entity id, keeping stronger priority", () => {
    const base = getSearchZeroRepeatOpportunity(search({ zeroResultCount: 3 }))!;
    const stronger = { ...base, priority: "high" as const, evidenceStrength: 20 };
    const weaker = { ...base, priority: "medium" as const, evidenceStrength: 3 };
    const deduped = dedupeGrowthOpportunities([weaker, stronger, weaker]);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]?.priority, "high");
  });

  it("allows independent rules on the same Recipe", () => {
    const row = recipe({
      contextualLinkCount: 0,
      hasUsableYouTube: false,
      failedRecommendedChecks: [{ id: "recipe.excerpt", label: "Add an excerpt" }],
    });
    const result = buildGrowthOpportunities({ recipes: [row] });
    const ruleIds = result.map((item) => item.ruleId).sort();
    assert.deepEqual(ruleIds, [
      "published_readiness_recommendations",
      "recipe_missing_youtube",
      "recipe_zero_contextual_links",
    ]);
  });

  it("orchestrates mixed fixtures deterministically without PII", () => {
    const first = buildGrowthOpportunities({
      searches: [
        search({ queryNorm: "air fryer chicken", zeroResultCount: 12 }),
        search({ queryNorm: "air fryer chicken", zeroResultCount: 12 }),
        search({ queryNorm: "tiny", zeroResultCount: 1 }),
      ],
      categories: [
        category({
          slug: "breads",
          name: "Breads",
          group: "course",
          publishedRecipeCount: 2,
        }),
        category({
          slug: "cakes",
          name: "Cakes",
          group: "desserts",
          publishedRecipeCount: 0,
          description: "",
        }),
        category({
          slug: "cookies",
          name: "Cookies",
          group: "desserts",
          publishedRecipeCount: 3,
          description: "",
        }),
      ],
      ingredients: [
        ingredient({ slug: "yeast", name: "Yeast", publishedRecipeCount: 2 }),
        ingredient({ slug: "water", name: "Water", publishedRecipeCount: 1 }),
      ],
      recipes: [
        recipe({
          id: "r-cookies",
          title: "Chocolate Chunk Cookies",
          contextualLinkCount: 0,
          hasUsableYouTube: false,
          stepTimestampCount: 0,
          failedRecommendedChecks: [{ id: "recipe.excerpt", label: "Add an excerpt" }],
        }),
        recipe({
          id: "r-flatbread",
          title: "Soft Stovetop Flatbread",
          contextualLinkCount: 0,
          hasContextualSuggestion: true,
          hasUsableYouTube: true,
          stepTimestampCount: 0,
        }),
      ],
      series: [
        series({ id: "s-thin", name: "Weekend Bakes", publishedRecipeMemberCount: 1 }),
        series({ id: "s-draft", name: "Draft", isPublished: false, publishedRecipeMemberCount: 0 }),
      ],
    });

    const second = buildGrowthOpportunities({
      searches: [
        search({ queryNorm: "air fryer chicken", zeroResultCount: 12 }),
        search({ queryNorm: "air fryer chicken", zeroResultCount: 12 }),
        search({ queryNorm: "tiny", zeroResultCount: 1 }),
      ],
      categories: [
        category({
          slug: "breads",
          name: "Breads",
          group: "course",
          publishedRecipeCount: 2,
        }),
        category({
          slug: "cakes",
          name: "Cakes",
          group: "desserts",
          publishedRecipeCount: 0,
          description: "",
        }),
        category({
          slug: "cookies",
          name: "Cookies",
          group: "desserts",
          publishedRecipeCount: 3,
          description: "",
        }),
      ],
      ingredients: [
        ingredient({ slug: "yeast", name: "Yeast", publishedRecipeCount: 2 }),
        ingredient({ slug: "water", name: "Water", publishedRecipeCount: 1 }),
      ],
      recipes: [
        recipe({
          id: "r-cookies",
          title: "Chocolate Chunk Cookies",
          contextualLinkCount: 0,
          hasUsableYouTube: false,
          stepTimestampCount: 0,
          failedRecommendedChecks: [{ id: "recipe.excerpt", label: "Add an excerpt" }],
        }),
        recipe({
          id: "r-flatbread",
          title: "Soft Stovetop Flatbread",
          contextualLinkCount: 0,
          hasContextualSuggestion: true,
          hasUsableYouTube: true,
          stepTimestampCount: 0,
        }),
      ],
      series: [
        series({ id: "s-thin", name: "Weekend Bakes", publishedRecipeMemberCount: 1 }),
        series({ id: "s-draft", name: "Draft", isPublished: false, publishedRecipeMemberCount: 0 }),
      ],
    });

    assert.deepEqual(
      first.map((row) => row.id),
      second.map((row) => row.id),
    );

    const ids = first.map((row) => row.id);
    assert.ok(ids.includes("search_zero_repeat:search_query:air fryer chicken"));
    assert.equal(ids.filter((id) => id.includes("air fryer chicken")).length, 1);
    assert.ok(ids.includes("category_below_indexable:category:breads"));
    assert.ok(ids.includes("category_below_indexable:category:cakes"));
    assert.ok(ids.includes("category_empty_indexable_description:category:cookies"));
    assert.ok(!ids.includes("category_empty_indexable_description:category:cakes"));
    assert.ok(ids.includes("ingredient_near_indexable:ingredient:yeast"));
    assert.ok(!ids.some((id) => id.includes("ingredient:water")));
    assert.ok(ids.includes("recipe_zero_contextual_links:recipe:r-cookies"));
    assert.ok(ids.includes("recipe_missing_youtube:recipe:r-cookies"));
    assert.ok(!ids.includes("recipe_youtube_missing_timestamps:recipe:r-cookies"));
    assert.ok(ids.includes("recipe_youtube_missing_timestamps:recipe:r-flatbread"));
    assert.ok(!ids.includes("recipe_missing_youtube:recipe:r-flatbread"));
    assert.ok(ids.includes("series_thin_published:series:s-thin"));
    assert.ok(!ids.includes("series_thin_published:series:s-draft"));

    assert.equal(first[0]?.priority, "high");
    assertNoPii(first);
  });
});

describe("growth-opportunities — purity contracts", () => {
  it("source does not import Prisma, db clients, fetch, or server-only", () => {
    assert.doesNotMatch(growthSource, /from ["']@prisma\/client["']/);
    assert.doesNotMatch(growthSource, /from ["']@\/lib\/db["']/);
    assert.doesNotMatch(growthSource, /server-only/);
    assert.doesNotMatch(growthSource, /\bfetch\s*\(/);
    assert.doesNotMatch(growthSource, /process\.env/);
    assert.doesNotMatch(growthSource, /recordAdminAuditEvent/);
  });

  it("serialized opportunities omit PII keys by contract", () => {
    const opportunity = getSearchZeroRepeatOpportunity(search({ zeroResultCount: 4 }));
    assertNoPii(opportunity);
    const keys = Object.keys(opportunity!);
    for (const banned of ["visitorId", "userId", "email", "subscriberId"]) {
      assert.ok(!keys.includes(banned));
    }
  });
});
