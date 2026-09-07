import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectPathsForRecipe,
  isRecipeCookPath,
  parseRecipeDetailPath,
  resolvePerformancePath,
  type PerformanceIdentityContext,
} from "@/lib/content-performance/identity";
import { aggregateGoogleFromRows } from "@/lib/content-performance/gsc";
import {
  aggregateFunnelForRecipe,
  RECIPE_TO_VIDEO_OPEN_NAMES,
  VIDEO_TO_RECIPE_NAME,
} from "@/lib/content-performance/funnels";
import { aggregateWebsiteFromVisitorSets } from "@/lib/content-performance/website";
import { memberMetricsFromCounts } from "@/lib/content-performance/member";
import { youtubeMetricsFromAggregate } from "@/lib/content-performance/youtube";
import { emptyAggregatedMetrics } from "@/lib/youtube-analytics/aggregate";
import { canAccess } from "@/lib/admin-access";

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(path.join(srcRoot, rel), "utf8");
}

function fixtureContext(): PerformanceIdentityContext {
  const recipesBySlug = new Map([
    ["slug-c", { id: "recipe-b", slug: "slug-c", title: "Renamed Bread", status: "published" }],
    ["flatbread", { id: "recipe-a", slug: "flatbread", title: "Flatbread", status: "published" }],
    ["draft-old", { id: "recipe-e", slug: "draft-old", title: "Draft Pasta", status: "draft" }],
  ]);
  const recipesById = new Map(
    [...recipesBySlug.values()].map((row) => [row.id, row] as const),
  );
  const seriesBySlug = new Map([
    ["weekend", { id: "series-1", slug: "weekend", title: "Weekend", status: "published" }],
  ]);
  const seriesById = new Map([["series-1", seriesBySlug.get("weekend")!]]);
  const redirectToByFrom = new Map([
    ["/recipes/slug-a", "/recipes/slug-b"],
    ["/recipes/slug-b", "/recipes/slug-c"],
    ["/recipes/gone", "/category/mains"],
    ["/recipes/cycle-a", "/recipes/cycle-b"],
    ["/recipes/cycle-b", "/recipes/cycle-a"],
  ]);
  return { recipesBySlug, recipesById, seriesBySlug, seriesById, redirectToByFrom };
}

describe("phase 7B — identity resolution", () => {
  it("resolves current Recipe path directly", () => {
    const ctx = fixtureContext();
    const resolved = resolvePerformancePath("/recipes/flatbread", ctx);
    assert.equal(resolved.status, "resolved");
    if (resolved.status === "resolved") {
      assert.deepEqual(resolved.entity, { kind: "recipe", recipeId: "recipe-a" });
    }
  });

  it("aggregates double slug rename under one Recipe.id", () => {
    const ctx = fixtureContext();
    for (const path of ["/recipes/slug-a", "/recipes/slug-b", "/recipes/slug-c"]) {
      const resolved = resolvePerformancePath(path, ctx);
      assert.equal(resolved.status, "resolved");
      if (resolved.status === "resolved") {
        assert.equal(resolved.entity.kind, "recipe");
        if (resolved.entity.kind === "recipe") {
          assert.equal(resolved.entity.recipeId, "recipe-b");
        }
      }
    }
    const paths = collectPathsForRecipe(
      "recipe-b",
      ["/recipes/slug-a", "/recipes/slug-b", "/recipes/slug-c", "/recipes/flatbread"],
      ctx,
    );
    assert.deepEqual(paths, ["/recipes/slug-a", "/recipes/slug-b", "/recipes/slug-c"]);
  });

  it("keeps invalid redirect cycles unresolved", () => {
    const ctx = fixtureContext();
    const resolved = resolvePerformancePath("/recipes/cycle-a", ctx);
    assert.equal(resolved.status, "unresolved");
  });

  it("does not force redirect-to-category into Recipe identity", () => {
    const ctx = fixtureContext();
    const resolved = resolvePerformancePath("/recipes/gone", ctx);
    assert.equal(resolved.status, "resolved");
    if (resolved.status === "resolved") {
      assert.equal(resolved.entity.kind, "page");
      if (resolved.entity.kind === "page") {
        assert.equal(resolved.entity.path, "/category/mains");
        assert.equal(resolved.entity.routeKind, "category");
      }
    }
  });

  it("resolves Series and known hubs; leaves unknown unresolved", () => {
    const ctx = fixtureContext();
    const series = resolvePerformancePath("/series/weekend", ctx);
    assert.equal(series.status, "resolved");
    if (series.status === "resolved") {
      assert.deepEqual(series.entity, { kind: "series", seriesId: "series-1" });
    }
    const home = resolvePerformancePath("/", ctx);
    assert.equal(home.status, "resolved");
    const unknown = resolvePerformancePath("/legacy/mystery", ctx);
    assert.equal(unknown.status, "unresolved");
  });

  it("excludes Cooking Mode subroute from ordinary Recipe path parsing", () => {
    assert.equal(isRecipeCookPath("/recipes/flatbread/cook"), true);
    assert.equal(parseRecipeDetailPath("/recipes/flatbread/cook"), null);
    assert.equal(parseRecipeDetailPath("/recipes/flatbread"), "flatbread");
  });
});

describe("phase 7B — aggregation math and semantics", () => {
  it("aggregates GSC historical URLs with 7A CTR and weighted position", () => {
    const rows = [
      {
        date: "2026-09-01",
        pageUrl: "https://mesakitchenstudio.com/recipes/slug-a",
        normalizedPath: "/recipes/slug-a",
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        position: 20,
      },
      {
        date: "2026-09-01",
        pageUrl: "https://mesakitchenstudio.com/recipes/slug-c",
        normalizedPath: "/recipes/slug-c",
        clicks: 9,
        impressions: 90,
        ctr: 0.1,
        position: 5,
      },
    ];
    const google = aggregateGoogleFromRows(rows, ["/recipes/slug-a", "/recipes/slug-c"], true);
    assert.equal(google.clicks, 10);
    assert.equal(google.impressions, 100);
    assert.equal(google.ctr, 0.1);
    assert.equal(google.position, (20 * 10 + 5 * 90) / 100);
    assert.deepEqual(google.contributingPaths, ["/recipes/slug-a", "/recipes/slug-c"]);
  });

  it("does not invent zeros when Google is disconnected with no rows", () => {
    const google = aggregateGoogleFromRows([], [], false);
    assert.equal(google.availability, "not_connected");
    assert.equal(google.clicks, null);
  });

  it("aggregates website visitor sets without exposing visitor ids", () => {
    const website = aggregateWebsiteFromVisitorSets({
      paths: ["/recipes/slug-a", "/recipes/slug-c"],
      pageViews: 5,
      visitorIds: new Set(["v1", "v2", "v1"]),
    });
    assert.equal(website.pageViews, 5);
    assert.equal(website.uniqueVisitors, 2);
    assert.equal(JSON.stringify(website).includes("v1"), false);
  });

  it("counts Recipe→Video and Video→Recipe by stable Recipe id", () => {
    const funnel = aggregateFunnelForRecipe(
      [
        {
          name: "recipe_video_play",
          recipeId: "recipe-a",
          recipeSlug: "flatbread",
          targetRecipeId: "",
          youtubeVideoId: "yt1",
        },
        {
          name: "recipe_watch_on_youtube_click",
          recipeId: "recipe-a",
          recipeSlug: "flatbread",
          targetRecipeId: "",
          youtubeVideoId: "yt1",
        },
        {
          name: "video_to_recipe",
          recipeId: "recipe-a",
          recipeSlug: "flatbread",
          targetRecipeId: "recipe-a",
          youtubeVideoId: "yt1",
        },
        {
          name: "recipe_video_play",
          recipeId: "other",
          recipeSlug: "other",
          targetRecipeId: "",
          youtubeVideoId: "yt2",
        },
      ],
      "recipe-a",
    );
    assert.equal(funnel.recipeToVideoOpens, 2);
    assert.equal(funnel.videoToRecipeClicks, 1);
    assert.ok(RECIPE_TO_VIDEO_OPEN_NAMES.has("recipe_video_play"));
    assert.equal(VIDEO_TO_RECIPE_NAME, "video_to_recipe");
  });

  it("labels member saves as current-state counts", () => {
    const member = memberMetricsFromCounts({ saves: 14, reviews: 2, ratingSum: 9 });
    assert.equal(member.savesCurrent, 14);
    assert.equal(member.reviewsCurrent, 2);
    assert.equal(member.averageRating, 4.5);
  });

  it("shows YouTube unavailable instead of fake zero when disconnected", () => {
    const metrics = youtubeMetricsFromAggregate("abc", emptyAggregatedMetrics(), false);
    assert.equal(metrics.availability, "not_connected");
    assert.equal(metrics.views, null);
  });
});

describe("phase 7B — wiring / separation / permissions", () => {
  it("wires Content Performance routes without schema Content model", () => {
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /model (Content|ContentItem|UnifiedContent|ContentPerformance)/);
    assert.match(schema, /model SearchConsolePageMetric/);
    assert.match(schema, /model FunnelEvent/);
    assert.match(schema, /model GuestPageView/);

    const page = read("app/admin/(app)/content-performance/page.tsx");
    assert.match(page, /requireAccess\("content"\)/);
    assert.match(page, /loadContentPerformanceDashboard/);
    assert.doesNotMatch(page, /Opportunity Score|SEO score|Total reach|Total Views/i);
    assert.match(page, /Google Search|Website|Mesa Funnel|Content Performance/);

    const detail = read("app/admin/(app)/content-performance/recipes/[id]/page.tsx");
    assert.match(detail, /loadRecipePerformanceDetail/);
    assert.match(detail, /Historical URLs included/);
    assert.match(detail, /Saved by \{recipe\.member\.savesCurrent\} members/);
    assert.match(detail, /Current member state/);
    assert.doesNotMatch(detail, /Queries for this Recipe/);

    const nav = read("lib/admin-nav.ts");
    assert.match(nav, /\/admin\/content-performance/);
    assert.match(nav, /Content Performance/);

    const dash = read("lib/content-performance/dashboard.ts");
    assert.match(dash, /loadVideoAnalyticsAggregatesForIds/);
    assert.doesNotMatch(dash, /for \(const recipe of .*\)[\s\S]{0,200}findMany/);
    assert.doesNotMatch(dash, /googleapis\.com/);
    assert.match(dash, /isRecipeCookPath/);
  });

  it("keeps health / search / visitors / YouTube source pages separate", () => {
    const siteHealth = read("lib/site-health.ts");
    assert.doesNotMatch(siteHealth, /content-performance|Content Performance/);
    const contentHealth = read("lib/recipe-content-health.ts");
    assert.doesNotMatch(contentHealth, /content-performance|Google clicks/);
    const gscPage = read("app/admin/(app)/search-console/page.tsx");
    assert.match(gscPage, /Search Console/);
    assert.doesNotMatch(gscPage, /Unified Content Performance/);
  });

  it("uses content access for the page and YouTube area for YouTube metrics", () => {
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("editor", "youtube"), true);
    assert.equal(canAccess("members", "content"), false);
    const page = read("app/admin/(app)/content-performance/page.tsx");
    assert.match(page, /canAccess\(admin\.role, "youtube"\)/);
  });

  it("documents cook mode and favorite historical limits", () => {
    const funnels = read("lib/content-performance/funnels.ts");
    assert.doesNotMatch(funnels, /recipe_cook_mode|recipe_favorite/);
    const analytics = read("lib/analytics.ts");
    assert.match(analytics, /recipe_cook_mode_start/);
    assert.match(analytics, /recipe_favorite/);
    const funnelNames = read("lib/funnel-analytics.ts");
    assert.doesNotMatch(funnelNames, /recipe_cook_mode_start|recipe_favorite/);
  });
});
