/**
 * Roadmap #13 Phase 13E — hardening contracts (search bounds, scale, wording, gate).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GrowthOpportunitiesView } from "@/components/admin/GrowthOpportunitiesView";
import {
  GROWTH_SEARCH_WINDOW_DAYS,
  GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT,
  GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT,
  buildGrowthOpportunities,
  getCategoryBelowIndexableOpportunity,
  getIngredientNearIndexableOpportunity,
  getRecipeReadinessOpportunity,
  getSearchZeroRepeatOpportunity,
  type GrowthOpportunity,
  type GrowthRecipeAggregate,
} from "@/lib/growth-opportunities";
import { loadAdminGrowthOpportunitiesPayload } from "@/lib/growth-opportunities-server";
import { isSafeAdminGrowthHref } from "@/lib/growth-opportunities-ui";

const root = path.dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(path.join(root, "growth-opportunities-server.ts"), "utf8");
const pageSource = readFileSync(
  path.join(root, "../app/admin/(app)/growth/page.tsx"),
  "utf8",
);
const engineSource = readFileSync(path.join(root, "growth-opportunities.ts"), "utf8");

function recipeAgg(partial: Partial<GrowthRecipeAggregate>): GrowthRecipeAggregate {
  return {
    id: "r1",
    title: "Toast",
    isPublished: true,
    contextualLinkCount: 0,
    hasUsableYouTube: false,
    stepTimestampCount: 0,
    failedRecommendedChecks: [],
    ...partial,
  };
}

describe("growth opportunities 13E — search bound + wording contracts", () => {
  it("server uses groupBy with having/take and never unbounded findMany for SearchEvent", () => {
    assert.match(serverSource, /searchEvent\.groupBy/);
    assert.match(serverSource, /take:\s*GROWTH_SEARCH_AGGREGATE_CANDIDATE_CAP/);
    assert.match(serverSource, /gte:\s*GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT/);
    assert.doesNotMatch(serverSource, /searchEvent\.findMany/);
    assert.match(serverSource, /GROWTH_SEARCH_AGGREGATE_CANDIDATE_CAP\s*=\s*200/);
  });

  it("gate remains before loader on Growth page", () => {
    const gate = pageSource.indexOf("isAdminGrowthOpportunitiesEnabled()");
    const notFound = pageSource.indexOf("notFound()");
    const loader = pageSource.indexOf("getAdminGrowthOpportunities()");
    assert.ok(gate >= 0 && notFound > gate && loader > notFound);
  });

  it("evidence wording stays factual (no SEO promise / error labeling)", () => {
    assert.doesNotMatch(engineSource, /guaranteed growth|high SEO potential|traffic opportunity|ranking boost|SEO win/i);
    assert.doesNotMatch(engineSource, /Google demand|SEO keyword volume|market demand/i);
    assert.doesNotMatch(engineSource, /one Recipe away/);
    assert.match(engineSource, /Recommended improvement:/);
    assert.match(engineSource, /returned zero Recipes/);
    assert.match(
      engineSource,
      /Review whether another appropriate Recipe can strengthen this ingredient cluster/,
    );

    const r1 = getSearchZeroRepeatOpportunity({
      queryNorm: "air fryer chicken",
      displayQuery: "air fryer chicken",
      zeroResultCount: GROWTH_ZERO_RESULT_SEARCH_MIN_COUNT,
      windowDays: GROWTH_SEARCH_WINDOW_DAYS,
    });
    assert.ok(r1);
    assert.match(r1!.evidence[0]!, /returned zero Recipes/);
    assert.doesNotMatch(r1!.evidence.join(" "), /Google|SEO keyword/i);

    const r2zero = getCategoryBelowIndexableOpportunity({
      id: "c0",
      slug: "empty",
      name: "Empty",
      group: "course",
      description: "",
      publishedRecipeCount: 0,
    });
    assert.ok(r2zero);
    assert.match(r2zero!.evidence.join(" "), /no Published Recipes/);
    assert.doesNotMatch(r2zero!.evidence.join(" "), /one Recipe away/);

    const r4 = getIngredientNearIndexableOpportunity({
      id: "i1",
      slug: "yeast",
      name: "Yeast",
      publishedRecipeCount: 2,
    });
    assert.ok(r4);
    assert.match(r4!.evidence.join(" "), /Appears in 2 Published Recipes/);
    assert.doesNotMatch(r4!.evidence.join(" "), /^Add yeast/i);

    const r9 = getRecipeReadinessOpportunity(
      recipeAgg({
        failedRecommendedChecks: [{ id: "recipe.description", label: "SEO description" }],
      }),
    );
    assert.ok(r9);
    assert.match(r9!.evidence[0]!, /Recommended improvement:/);
    assert.doesNotMatch(r9!.evidence.join(" "), /\bError\b|\bFailure\b|\bBroken\b/);
  });

  it("href fail-closed rejects non-admin schemes", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,x",
      "https://evil.example",
      "//evil.example",
      "/",
      "/admin",
      "/recipes/x",
      "/admin/growth\n",
    ]) {
      assert.equal(isSafeAdminGrowthHref(href), false, href);
    }
  });
});

describe("growth opportunities 13E — scale", () => {
  it("fixed query count with 300 published recipes (#11 in memory)", async () => {
    const n = 300;
    const recipes = Array.from({ length: n }, (_, i) => ({
      id: `scale-r-${i}`,
      title: `Scale Recipe ${i}`,
      slug: `scale-recipe-${i}`,
      status: "published",
      excerpt: "",
      publishedAt: new Date("2024-01-01T00:00:00.000Z"),
      relatedRecipeIds: "[]",
      values: JSON.stringify({
        // Shared series/type signals help #11 find candidates without DB.
        cuisine: "Italian",
        tags: ["bread"],
      }),
      typeId: "t-scale",
      type: { id: "t-scale", name: "Scale Type" },
      categories: [
        {
          categoryId: "cat-scale",
          category: { id: "cat-scale", name: "Breads", group: "course", slug: "breads" },
        },
      ],
      seriesItems: [
        { series: { id: "series-scale", title: "Scale Series" } },
      ],
      recipeIngredients: [],
    }));

    const labels: string[] = [];
    const db = {
      recipe: {
        findMany: async () => {
          labels.push("recipe.findMany");
          return recipes;
        },
      },
      category: {
        findMany: async () => {
          labels.push("category.findMany");
          return [
            {
              id: "cat-scale",
              slug: "breads",
              name: "Breads",
              group: "course",
              description: "x",
            },
          ];
        },
      },
      series: {
        findMany: async () => {
          labels.push("series.findMany");
          return [];
        },
      },
      searchEvent: {
        groupBy: async () => {
          labels.push("searchEvent.groupBy");
          return [];
        },
      },
      recipeTypeField: {
        findMany: async () => {
          labels.push("recipeTypeField.findMany");
          return [];
        },
      },
    } as unknown as ReturnType<typeof import("@/lib/db").getDb>;

    const t0 = performance.now();
    const result = await loadAdminGrowthOpportunitiesPayload({ db, now: new Date() });
    const ms = performance.now() - t0;

    assert.deepEqual(labels.sort(), [
      "category.findMany",
      "recipe.findMany",
      "recipeTypeField.findMany",
      "searchEvent.groupBy",
      "series.findMany",
    ]);
    assert.ok(result.opportunities.length > 0);
    assert.ok(ms < 15_000, `scale load too slow: ${ms}ms`);
    // #11 may raise some R5 to high without exposing scores.
    const blob = JSON.stringify(result);
    assert.doesNotMatch(blob, /"score"\s*:/);
    assert.doesNotMatch(blob, /visitorId/i);
  });

  it("long content stress does not overflow markup contracts", () => {
    const longTitle = `Very long Recipe title ${"x".repeat(180)}`;
    const longQuery = `long search ${"q".repeat(120)} <script>&"'/`;
    const opportunities: GrowthOpportunity[] = [
      {
        id: "search_zero_repeat:search_query:long",
        ruleId: "search_zero_repeat",
        type: "search_demand",
        priority: "high",
        title: `Review zero-result search '${longQuery}'`,
        evidence: [
          `'${longQuery}' returned zero Recipes ${GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT} times in the last ${GROWTH_SEARCH_WINDOW_DAYS} days.`,
        ],
        priorityReason: "Zero-result count meets the high band with a very long reason ".repeat(3),
        actionLabel: "Review search coverage",
        href: "/admin/search",
        entityType: "search_query",
        entityId: "long",
        windowDays: GROWTH_SEARCH_WINDOW_DAYS,
        evidenceStrength: GROWTH_ZERO_RESULT_SEARCH_HIGH_COUNT,
      },
      {
        id: "published_readiness_recommendations:recipe:r-long",
        ruleId: "published_readiness_recommendations",
        type: "content_quality",
        priority: "medium",
        title: `Review recommendations for ${longTitle}`,
        evidence: [
          "Recommended improvement: SEO description.",
          "Recommended improvement: Hero image.",
          "Recommended improvement: Preparation time.",
        ],
        priorityReason: "Published Recipe has recommended (non-blocking) readiness improvements.",
        actionLabel: "Review recommendations",
        href: "/admin/recipes/r-long",
        entityType: "recipe",
        entityId: "r-long",
      },
    ];

    const html = renderToStaticMarkup(
      createElement(GrowthOpportunitiesView, { opportunities }),
    );
    assert.match(html, /break-words/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&amp;/);
    assert.match(html, /&quot;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /Why this priority:/);
  });

  it("orchestrator preserves deterministic order under large mixed input", () => {
    const recipes = Array.from({ length: 80 }, (_, i) =>
      recipeAgg({
        id: `r-${String(i).padStart(3, "0")}`,
        title: `Recipe ${i}`,
        contextualLinkCount: 0,
        hasUsableYouTube: i % 2 === 0,
        stepTimestampCount: i % 2 === 0 ? 0 : 2,
      }),
    );
    const first = buildGrowthOpportunities({ recipes });
    const second = buildGrowthOpportunities({ recipes });
    assert.deepEqual(
      first.map((o) => o.id),
      second.map((o) => o.id),
    );
    const ids = new Set(first.map((o) => o.id));
    assert.equal(ids.size, first.length);
  });
});

describe("growth opportunities 13E — loader independence", () => {
  it("getAdminGrowthOpportunities source still requires content access", () => {
    assert.match(serverSource, /requireAccess\(\s*["']content["']\s*\)/);
    assert.match(serverSource, /export async function getAdminGrowthOpportunities/);
  });

  it("empty inputs do not invent opportunities", async () => {
    const db = {
      recipe: { findMany: async () => [] },
      category: { findMany: async () => [] },
      series: { findMany: async () => [] },
      searchEvent: { groupBy: async () => [] },
      recipeTypeField: { findMany: async () => [] },
    } as unknown as ReturnType<typeof import("@/lib/db").getDb>;
    const result = await loadAdminGrowthOpportunitiesPayload({ db });
    assert.deepEqual(result.opportunities, []);
    assert.equal(result.summary.total, 0);
  });
});
