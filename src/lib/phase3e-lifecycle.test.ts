/**
 * Phase 3E — Cross-system discovery regression / ownership verification.
 * Isolated fixtures only — no production data mutation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { homepageCollectionSlugMap } from "../data/homepage.ts";
import type { Recipe } from "../data/types.ts";
import {
  applyDiscoveryFilters,
  buildRecipesUrl,
  parseDiscoveryParams,
} from "./recipe-discovery.ts";
import {
  mergeRecentlyViewedEntry,
  parseRecentlyViewedList,
  resolveRecentlyViewedRecipes,
  RECENTLY_VIEWED_MAX_AGE_DAYS,
  RECENTLY_VIEWED_MAX_STORED,
} from "./recently-viewed.ts";
import { rankRelatedRecipesFromPool } from "./recipe-related.ts";
import {
  normalizeSearchAnalyticsQuery,
  sanitizeSearchAnalyticsFilters,
} from "./search-analytics.ts";
import {
  normalizeSearchText,
  scoreOverlayRecipeMatch,
  scoreRecipeTextMatch,
  searchOverlayRecipesByText,
  searchRecipesByText,
  totalMinutes,
} from "./recipe-utils.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

function fixtureRecipe(
  partial: Partial<Recipe> & Pick<Recipe, "slug" | "title"> & { id?: string },
): Recipe {
  return {
    excerpt: "",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "/x.jpg",
    imageAlt: partial.title,
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    prepMinutes: 10,
    cookMinutes: 20,
    restMinutes: 0,
    difficulty: "Easy",
    utensils: [],
    servings: 4,
    servingsUnit: "servings",
    course: "Main",
    method: "Bake",
    cuisine: "Mexican",
    categories: ["main-dishes"],
    tags: [],
    featured: false,
    seasonal: false,
    ingredients: [{ items: [{ item: "salt" }] }],
    instructions: [{ steps: ["Cook"] }],
    notes: [],
    nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
    ...partial,
  };
}

const baguette = fixtureRecipe({
  id: "id-baguette",
  slug: "classic-french-baguettes",
  title: "Classic French Baguettes",
  dishName: "Baguette",
  course: "Bread",
  method: "Bake",
  cuisine: "French",
  categories: ["breads"],
  prepMinutes: 30,
  cookMinutes: 0,
  bakeMinutes: 25,
  restMinutes: 120,
  ingredients: [{ items: [{ item: "bread flour" }, { item: "salt" }] }],
});

const focaccia = fixtureRecipe({
  id: "id-focaccia",
  slug: "herb-focaccia",
  title: "Herb Focaccia",
  course: "Bread",
  method: "Bake",
  cuisine: "Italian",
  categories: ["breads"],
  prepMinutes: 20,
  bakeMinutes: 30,
  cookMinutes: 0,
  restMinutes: 60,
  ingredients: [{ items: [{ item: "olive oil" }, { item: "flour" }] }],
});

const chile = fixtureRecipe({
  id: "id-chile",
  slug: "weeknight-chile",
  title: "Weeknight Chile",
  course: "Main",
  method: "Stovetop",
  cuisine: "Mexican",
  categories: ["main-dishes"],
  prepMinutes: 15,
  cookMinutes: 35,
  bakeMinutes: 0,
  restMinutes: 0,
  ingredients: [{ items: [{ item: "ground beef" }, { item: "chile powder" }] }],
  youtube: {
    videoId: "abc123xyz01",
    title: "Chile",
    duration: "10:00",
    timestamps: [],
  },
});

const salsa = fixtureRecipe({
  id: "id-salsa",
  slug: "salsa-verde",
  title: "Salsa Verde",
  course: "Sauce",
  method: "Stovetop",
  cuisine: "Mexican",
  categories: ["toppings-condiments"],
  prepMinutes: 10,
  cookMinutes: 15,
  ingredients: [{ items: [{ item: "tomatillo" }, { item: "cilantro" }] }],
});

const draft = fixtureRecipe({
  id: "id-draft",
  slug: "secret-draft-cake",
  title: "Secret Draft Cake",
  categories: ["cakes"],
});

const pool = [baguette, focaccia, chile, salsa];
const collectionMap = {
  "test-weekend-baking": ["classic-french-baguettes", "herb-focaccia"],
};

describe("phase 3e — architecture ownership", () => {
  it("documents a single SearchEvent write path and dual intentional emitters", () => {
    const client = read("lib/search-analytics-client.ts");
    const server = read("lib/search-analytics-server.ts");
    const route = read("app/api/analytics/search/route.ts");
    const discovery = read("components/RecipeDiscovery.tsx");
    const overlay = read("components/SearchOverlay.tsx");
    const recipesPage = read("app/recipes/page.tsx");

    assert.match(client, /recordSearchAnalytics/);
    assert.match(server, /db\.searchEvent\.create/);
    assert.match(route, /persistSearchEvent/);
    assert.match(route, /isAnalyticsConsentGranted/);

    // Production emitters (exactly these UI commit points)
    assert.match(discovery, /emitRecipeSearchAnalytics/);
    assert.match(overlay, /commitOverlaySearch/);
    assert.match(overlay, /emitRecipeSearchAnalytics/);

    // Catalogue page must not emit on hydrate/open
    assert.doesNotMatch(recipesPage, /emitRecipeSearchAnalytics|recordSearchAnalytics/);

    // No keystroke/useEffect emit in overlay
    assert.doesNotMatch(overlay, /useEffect\([^\)]*emitRecipeSearchAnalytics/);
  });

  it("keeps overlay → /recipes transition from double-counting via page hydrate", () => {
    const overlay = read("components/SearchOverlay.tsx");
    const discovery = read("components/RecipeDiscovery.tsx");
    const recipesPage = read("app/recipes/page.tsx");
    assert.match(overlay, /commitOverlaySearch/);
    assert.match(overlay, /router\.push\(buildRecipesUrl/);
    assert.match(discovery, /function onSearchSubmit/);
    assert.match(discovery, /function emitFilterDeadEndIfNeeded/);
    // Catalogue hydrate must not record; only explicit submit / filter dead-end helpers do.
    assert.doesNotMatch(recipesPage, /emitRecipeSearchAnalytics|recordSearchAnalytics/);
    const effectBlocks = [...discovery.matchAll(/useEffect\(([\s\S]*?)\n  \},/g)].map((m) => m[1] || "");
    for (const body of effectBlocks) {
      assert.doesNotMatch(body, /emitRecipeSearchAnalytics/);
    }
  });

  it("reuses Series for Collections and keeps /series canonical", () => {
    const decisions = read("lib/phase3c-collections.ts");
    const schema = read("../prisma/schema.prisma");
    assert.match(decisions, /PHASE3C_SERIES_ROUTE_PREFIX = "\/series"/);
    assert.match(schema, /model Series \{/);
    assert.doesNotMatch(schema, /model Collection\b/);
  });
});

describe("phase 3e — discovery lifecycle fixture", () => {
  it("ranks exact title above ingredient-only and excludes draft from public pool", () => {
    const ranked = searchRecipesByText(pool, "Classic French Baguettes");
    assert.equal(ranked[0]?.recipe.slug, "classic-french-baguettes");
    assert.ok(scoreRecipeTextMatch(baguette, "baguette") > scoreRecipeTextMatch(chile, "chile powder"));

    const flour = searchRecipesByText(pool, "bread flour");
    assert.ok(flour.some((row) => row.recipe.slug === "classic-french-baguettes"));
    assert.ok(!flour.some((row) => row.recipe.slug === draft.slug));
  });

  it("supports partial title and dishName without inventing distant matches", () => {
    const partial = searchRecipesByText(pool, "baguet");
    assert.equal(partial[0]?.recipe.slug, "classic-french-baguettes");
    assert.equal(searchRecipesByText(pool, "zzzznotarecipe").length, 0);

    const dish = searchRecipesByText(pool, "Baguette");
    assert.ok(dish[0]?.score && dish[0].score >= 780);
  });

  it("normalizes equivalent queries consistently for search and analytics", () => {
    assert.equal(normalizeSearchText("  Crispy   Rice "), "crispy rice");
    assert.equal(normalizeSearchAnalyticsQuery("  Crispy   Rice "), "crispy rice");
    assert.equal(normalizeSearchText("BAGUETTE"), normalizeSearchText("baguette"));
  });

  it("applies time / cuisine / method / video filters with AND + URL state", () => {
    assert.ok((totalMinutes(chile) ?? 0) > 0 && (totalMinutes(chile) ?? 0) <= 60);
    const under = applyDiscoveryFilters(pool, { time: "60", cuisine: "Mexican" }, collectionMap);
    assert.ok(under.every((recipe) => recipe.cuisine === "Mexican"));
    assert.ok(under.some((recipe) => recipe.slug === "weeknight-chile"));

    const video = applyDiscoveryFilters(pool, { video: true }, collectionMap);
    assert.deepEqual(
      video.map((recipe) => recipe.slug),
      ["weeknight-chile"],
    );

    const dead = applyDiscoveryFilters(
      pool,
      { cuisine: "French", method: "Stovetop", video: true },
      collectionMap,
    );
    assert.equal(dead.length, 0);

    const url = buildRecipesUrl({ q: "rice", time: "60", cuisine: "Mexican", video: true });
    assert.match(url, /q=rice/);
    assert.match(url, /time=60/);
    assert.match(url, /cuisine=Mexican/);
    assert.match(url, /video=1/);
    assert.doesNotMatch(url, /sort=/);

    const parsed = parseDiscoveryParams({
      q: "rice",
      time: "60",
      cuisine: "Mexican",
      video: "1",
      bogon: "x",
    });
    assert.equal(parsed.q, "rice");
    assert.equal(parsed.time, "60");
    assert.equal((parsed as { bogon?: string }).bogon, undefined);
  });

  it("keeps legacy collection= distinct from editorial Series collections", () => {
    const map = homepageCollectionSlugMap();
    assert.ok(Object.keys(map).length >= 1);
    const filtered = applyDiscoveryFilters(
      pool,
      { collection: "test-weekend-baking" },
      collectionMap,
    );
    assert.deepEqual(
      filtered.map((recipe) => recipe.slug),
      ["classic-french-baguettes", "herb-focaccia"],
    );
    const seriesPage = read("app/series/page.tsx");
    assert.doesNotMatch(seriesPage, /homepageCollectionSlugMap|collection=/);
  });

  it("aligns overlay title ranking with catalogue title preference", () => {
    const overlayPool = pool.map((recipe) => ({
      slug: recipe.slug,
      title: recipe.title,
      searchHaystack: [
        recipe.title,
        recipe.dishName || "",
        ...recipe.ingredients.flatMap((group) => group.items.map((item) => item.item)),
      ].join(" "),
    }));
    const overlay = searchOverlayRecipesByText(overlayPool, "baguette");
    const catalogue = searchRecipesByText(pool, "baguette");
    assert.equal(overlay[0]?.slug, catalogue[0]?.recipe.slug);
    assert.ok(scoreOverlayRecipeMatch(overlayPool[0]!, "Classic French Baguettes") >= 1000);
  });
});

describe("phase 3e — recently viewed / related / analytics fixtures", () => {
  it("dedupes, caps, expires, and resolves live catalogue by id then slug", () => {
    const now = Date.parse("2026-09-07T12:00:00.000Z");
    const a = {
      id: "id-baguette",
      slug: "old-baguette-slug",
      title: "Old",
      image: "/a.jpg",
      imageAlt: "A",
      viewedAt: "2026-09-07T11:00:00.000Z",
    };
    const b = {
      id: "id-focaccia",
      slug: "herb-focaccia",
      title: "Focaccia",
      image: "/b.jpg",
      imageAlt: "B",
      viewedAt: "2026-09-07T11:30:00.000Z",
    };
    const stale = {
      id: "gone",
      slug: "gone",
      title: "Gone",
      image: "/g.jpg",
      imageAlt: "G",
      viewedAt: "2025-01-01T00:00:00.000Z",
    };
    assert.equal(RECENTLY_VIEWED_MAX_AGE_DAYS, 90);
    assert.equal(RECENTLY_VIEWED_MAX_STORED, 12);

    let list = mergeRecentlyViewedEntry([], a, { nowMs: now });
    list = mergeRecentlyViewedEntry(list, b, { nowMs: now });
    list = mergeRecentlyViewedEntry(list, { ...a, viewedAt: "2026-09-07T12:00:00.000Z" }, { nowMs: now });
    assert.deepEqual(
      list.map((item) => item.id),
      ["id-baguette", "id-focaccia"],
    );

    const parsed = parseRecentlyViewedList(JSON.stringify([a, b, stale]), now);
    assert.equal(parsed.some((item) => item.id === "gone"), false);

    const catalogue = pool.map((recipe) => ({
      ...recipe,
      id: recipe.id,
    }));
    const resolved = resolveRecentlyViewedRecipes(
      [{ ...a, id: "id-baguette", slug: "old-baguette-slug" }, b],
      catalogue,
      { limit: 4 },
    );
    assert.equal(resolved[0]?.slug, "classic-french-baguettes");
    assert.ok(!resolved.some((recipe) => recipe.slug === draft.slug));
  });

  it("places manual related pins first then fills automatically without duplicates", () => {
    const ranked = rankRelatedRecipesFromPool(chile, pool, {
      limit: 3,
      manualRelatedIds: ["id-salsa", "id-baguette"],
    });
    assert.equal(ranked[0]?.slug, "salsa-verde");
    assert.equal(ranked[1]?.slug, "classic-french-baguettes");
    assert.ok(ranked.length <= 3);
    assert.ok(!ranked.some((recipe) => recipe.slug === chile.slug));
    assert.equal(new Set(ranked.map((recipe) => recipe.slug)).size, ranked.length);

    const autoOnly = rankRelatedRecipesFromPool(chile, pool, { limit: 3 });
    assert.ok(autoOnly.length > 0);
    assert.ok(!autoOnly.some((recipe) => recipe.slug === chile.slug));
  });

  it("drops missing related targets and keeps analytics filter sanitization safe", () => {
    const ranked = rankRelatedRecipesFromPool(chile, pool, {
      limit: 3,
      manualRelatedIds: ["id-missing", "id-salsa"],
    });
    assert.equal(ranked[0]?.slug, "salsa-verde");
    assert.deepEqual(
      sanitizeSearchAnalyticsFilters({ category: "breads", email: "x@y.com", query: "nope" }),
      { category: "breads" },
    );
  });
});

describe("phase 3e — phase 1/2 wiring regressions", () => {
  it("keeps readiness free of Collection / related / searchability requirements", () => {
    const readiness = read("lib/recipe-publishing-readiness.ts");
    assert.doesNotMatch(readiness, /relatedRecipeIds|SearchEvent|collection membership/i);
  });

  it("keeps related overrides off revision snapshots (separate relation state)", () => {
    const revisions = read("lib/recipe-revisions.ts");
    assert.doesNotMatch(revisions, /relatedRecipeIds/);
  });

  it("does not write search queries into AdminAuditEvent paths", () => {
    const audit = read("lib/admin-audit.ts");
    assert.doesNotMatch(audit, /SearchEvent|search_query|queryNorm/);
  });
});
