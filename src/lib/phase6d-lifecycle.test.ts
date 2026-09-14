import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Recipe } from "@/data/types";
import { recipeJsonLd } from "./schema.ts";
import {
  buildSitemapEntries,
  recipeSitemapPath,
  SITEMAP_INCLUDES_VIDEO_WATCH_PAGES,
  sitemapPathnamesFromEntries,
} from "./sitemap-entries.ts";
import {
  publicRobotsDisallow,
  robotsDisallowsAdmin,
  robotsDisallowsApi,
  robotsDisallowsProfile,
} from "./robots-policy.ts";
import {
  analyzeActiveRedirect,
  classifyInternalPublicPath,
  defaultSiteHealthPolicyFacts,
  evaluateSiteUrlConfig,
  groupSiteHealthIssues,
  runSiteHealthChecks,
  siteHealthStatusLabel,
  validateRecipeJsonLdShape,
  type SiteHealthContext,
  type SiteHealthRedirectRow,
} from "./site-health.ts";
import { normalizeRedirectPath, resolveRedirectChain } from "./redirects.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

function sampleRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    slug: "classic-baguettes",
    title: "Classic Baguettes",
    excerpt: "Crisp crust.",
    intro: "Intro",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "https://example.public.blob.vercel-storage.com/b.jpg",
    imageAlt: "Baguettes",
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    prepMinutes: 20,
    cookMinutes: 30,
    servings: 4,
    servingsUnit: "loaves",
    course: "Bread",
    method: "Bake",
    cuisine: "French",
    categories: ["bread"],
    tags: [],
    ingredients: [{ items: [{ item: "Flour", amount: "500g" }] }],
    instructions: [{ steps: ["Mix", "Bake"] }],
    notes: [],
    nutrition: { calories: 200, carbs: 40, protein: 6, fat: 1 },
    ...overrides,
  };
}

function baseContext(
  overrides: Partial<SiteHealthContext> = {},
): SiteHealthContext {
  return {
    siteUrl: "https://mesakitchenstudio.com",
    sitePrivate: false,
    studioPublicLaunchEnabled: false,
    productionLike: true,
    redirects: [],
    recipes: [
      {
        id: "pub-1",
        slug: "classic-baguettes",
        title: "Classic Baguettes",
        status: "published",
        scheduledPublishAt: null,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "draft-1",
        slug: "draft-loaf",
        title: "Draft Loaf",
        status: "draft",
        scheduledPublishAt: null,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "sched-1",
        slug: "scheduled-loaf",
        title: "Scheduled Loaf",
        status: "draft",
        scheduledPublishAt: "2026-12-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    categories: [{ id: "c1", slug: "bread", name: "Bread" }],
    series: [
      {
        id: "s1",
        slug: "weekend-baking",
        title: "Weekend Baking",
        isPublished: true,
        items: [
          {
            id: "si1",
            removedFromPlaylist: false,
            recipeId: "pub-1",
            recipeStatus: "published",
            youtubeVideoId: null,
            youtubePrivacyStatus: null,
          },
        ],
      },
      {
        id: "s2",
        slug: "draft-collection",
        title: "Draft Collection",
        isPublished: false,
        items: [],
      },
    ],
    studioLessons: [],
    policy: defaultSiteHealthPolicyFacts(),
    schemaSampleRecipe: sampleRecipe(),
    ...overrides,
  };
}

describe("phase 6D — redirect health", () => {
  it("1. normal redirect is healthy", () => {
    const redirects: SiteHealthRedirectRow[] = [
      {
        id: "r1",
        fromPath: "/recipes/old-bread",
        toPath: "/recipes/classic-baguettes",
        isActive: true,
        source: "recipe_slug_change",
      },
    ];
    const result = runSiteHealthChecks(baseContext({ redirects }));
    assert.equal(result.issues.some((i) => i.id.startsWith("redirect.")), false);
    assert.equal(result.checks.find((c) => c.id === "redirect.health")?.passed, true);
  });

  it("2. self redirect flagged", () => {
    const redirects: SiteHealthRedirectRow[] = [
      {
        id: "r2",
        fromPath: "/recipes/loop",
        toPath: "/recipes/loop",
        isActive: true,
        source: "manual",
      },
    ];
    const result = runSiteHealthChecks(baseContext({ redirects }));
    assert.ok(result.issues.some((i) => i.id === "redirect.self"));
  });

  it("3. cycle flagged", () => {
    const map = new Map([
      ["/recipes/a", { toPath: "/recipes/b", isActive: true }],
      ["/recipes/b", { toPath: "/recipes/a", isActive: true }],
    ]);
    const analysis = analyzeActiveRedirect(
      { fromPath: "/recipes/a", toPath: "/recipes/b", isActive: true },
      (p) => map.get(p),
    );
    assert.equal(analysis.problem, "cycle");
    const result = runSiteHealthChecks(
      baseContext({
        redirects: [
          {
            id: "ra",
            fromPath: "/recipes/a",
            toPath: "/recipes/b",
            isActive: true,
            source: "manual",
          },
          {
            id: "rb",
            fromPath: "/recipes/b",
            toPath: "/recipes/a",
            isActive: true,
            source: "manual",
          },
        ],
      }),
    );
    assert.ok(result.issues.some((i) => i.id === "redirect.cycle"));
  });

  it("4. unintended multi-hop chain flagged", () => {
    const result = runSiteHealthChecks(
      baseContext({
        redirects: [
          {
            id: "ra",
            fromPath: "/recipes/a",
            toPath: "/recipes/b",
            isActive: true,
            source: "manual",
          },
          {
            id: "rb",
            fromPath: "/recipes/b",
            toPath: "/recipes/classic-baguettes",
            isActive: true,
            source: "manual",
          },
        ],
      }),
    );
    assert.ok(result.issues.some((i) => i.id === "redirect.chain"));
  });

  it("5. inactive redirect ignored", () => {
    const result = runSiteHealthChecks(
      baseContext({
        redirects: [
          {
            id: "ri",
            fromPath: "/recipes/ghost",
            toPath: "/recipes/ghost",
            isActive: false,
            source: "manual",
          },
        ],
      }),
    );
    assert.equal(result.issues.some((i) => i.id.startsWith("redirect.")), false);
  });

  it("6–7. known valid target healthy; known missing internal target flagged", () => {
    const healthy = runSiteHealthChecks(
      baseContext({
        redirects: [
          {
            id: "ok",
            fromPath: "/recipes/old",
            toPath: "/recipes/classic-baguettes",
            isActive: true,
            source: "recipe_slug_change",
          },
        ],
      }),
    );
    assert.equal(healthy.issues.some((i) => i.id === "redirect.missing_target"), false);

    const missing = runSiteHealthChecks(
      baseContext({
        redirects: [
          {
            id: "miss",
            fromPath: "/recipes/old",
            toPath: "/recipes/does-not-exist",
            isActive: true,
            source: "manual",
          },
        ],
      }),
    );
    assert.ok(missing.issues.some((i) => i.id === "redirect.missing_target"));
  });

  it("8. resolver parity with Redirect Manager helpers", () => {
    const map = new Map([
      ["/recipes/a", { toPath: "/recipes/b", isActive: true }],
      ["/recipes/b", { toPath: "/recipes/c", isActive: true }],
    ]);
    assert.equal(resolveRedirectChain("/recipes/a", (p) => map.get(p)), "/recipes/c");
    const analysis = analyzeActiveRedirect(
      { fromPath: "/recipes/a", toPath: "/recipes/b", isActive: true },
      (p) => map.get(p),
    );
    assert.equal(analysis.finalDestination, "/recipes/c");
    assert.equal(normalizeRedirectPath("/recipes/x/"), "/recipes/x");
  });
});

describe("phase 6D — sitemap membership", () => {
  it("9–12. published included; draft, scheduled, and non-members excluded", () => {
    const ctx = baseContext();
    const published = ctx.recipes.filter((r) => r.status === "published");
    const entries = buildSitemapEntries({
      siteUrl: ctx.siteUrl,
      recipes: published.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt })),
      categories: ctx.categories.map((c) => ({ slug: c.slug })),
      series: ctx.series.filter((s) => s.isPublished).map((s) => ({ slug: s.slug })),
      includeStudio: false,
    });
    const paths = new Set(sitemapPathnamesFromEntries(entries, ctx.siteUrl));
    assert.ok(paths.has("/recipes/classic-baguettes"));
    assert.equal(paths.has("/recipes/draft-loaf"), false);
    assert.equal(paths.has("/recipes/scheduled-loaf"), false);

    const result = runSiteHealthChecks(ctx);
    assert.equal(result.checks.find((c) => c.id === "sitemap.published_recipes")?.passed, true);
    assert.equal(result.checks.find((c) => c.id === "sitemap.draft_excluded")?.passed, true);
  });

  it("13–14. current slug used; recipe URLs unique", () => {
    const entries = buildSitemapEntries({
      siteUrl: "https://mesakitchenstudio.com",
      recipes: [{ slug: "classic-baguettes", updatedAt: new Date() }],
      categories: [],
      series: [],
    });
    assert.ok(
      entries.some((e) => e.url === "https://mesakitchenstudio.com/recipes/classic-baguettes"),
    );
    const recipeUrls = entries.map((e) => e.url).filter((u) => u.includes("/recipes/classic"));
    assert.equal(new Set(recipeUrls).size, recipeUrls.length);
    assert.equal(recipeSitemapPath("classic-baguettes"), "/recipes/classic-baguettes");
  });

  it("15–16. published Collection included; unpublished excluded", () => {
    const result = runSiteHealthChecks(baseContext());
    assert.equal(result.checks.find((c) => c.id === "sitemap.series_policy")?.passed, true);
    const entries = buildSitemapEntries({
      siteUrl: "https://mesakitchenstudio.com",
      recipes: [],
      categories: [],
      series: [{ slug: "weekend-baking" }],
    });
    const paths = sitemapPathnamesFromEntries(entries, "https://mesakitchenstudio.com");
    assert.ok(paths.includes("/series/weekend-baking"));
    assert.equal(paths.includes("/series/draft-collection"), false);
  });

  it("17. video watch pages intentionally omitted from sitemap", () => {
    assert.equal(SITEMAP_INCLUDES_VIDEO_WATCH_PAGES, false);
    const entries = buildSitemapEntries({
      siteUrl: "https://mesakitchenstudio.com",
      recipes: [],
      categories: [],
      series: [],
    });
    assert.ok(entries.some((e) => e.url.endsWith("/videos")));
    assert.equal(
      entries.some((e) => /\/videos\/[^/]+$/.test(e.url)),
      false,
    );
  });

  it("18. Studio lessons only when launch enabled", () => {
    const off = buildSitemapEntries({
      siteUrl: "https://mesakitchenstudio.com",
      recipes: [],
      categories: [],
      series: [],
      studioLessons: [{ slug: "knife-skills" }],
      includeStudio: false,
    });
    assert.equal(
      off.some((e) => e.url.includes("/studio/knife-skills")),
      false,
    );
    const on = buildSitemapEntries({
      siteUrl: "https://mesakitchenstudio.com",
      recipes: [],
      categories: [],
      series: [],
      studioLessons: [{ slug: "knife-skills" }],
      includeStudio: true,
    });
    assert.ok(on.some((e) => e.url.endsWith("/studio/knife-skills")));
  });
});

describe("phase 6D — robots / noindex / canonical wiring", () => {
  it("19–26. robots + noindex + public indexable policies", () => {
    const disallow = publicRobotsDisallow(false);
    assert.equal(robotsDisallowsAdmin(disallow), true);
    assert.equal(robotsDisallowsProfile(disallow), true);
    assert.equal(robotsDisallowsApi(disallow), true);
    assert.ok(disallow.includes("/studio"));

    const adminLayout = read("app/admin/layout.tsx");
    assert.match(adminLayout, /robots:\s*\{\s*index:\s*false/);

    const profile = read("app/profile/page.tsx");
    assert.match(profile, /robots:\s*\{\s*index:\s*false/);

    const memberCollection = read("app/profile/collections/[collectionId]/page.tsx");
    assert.match(memberCollection, /robots:\s*\{\s*index:\s*false/);

    const cook = read("app/recipes/[slug]/cook/page.tsx");
    assert.match(cook, /robots:\s*\{\s*index:\s*false/);
    assert.doesNotMatch(cook, /recipeJsonLd/);

    const recipesIndex = read("app/recipes/page.tsx");
    assert.match(recipesIndex, /canonical:\s*"\/recipes"/);
    assert.match(recipesIndex, /index:\s*false/);

    const videosIndex = read("app/videos/page.tsx");
    assert.match(videosIndex, /canonical:\s*"\/videos"/);
    assert.match(videosIndex, /isShortsFilter[\s\S]*index:\s*false/);

    const recipePage = read("app/recipes/[slug]/page.tsx");
    assert.match(recipePage, /canonical:\s*`\/recipes\/\$\{/);
    assert.match(recipePage, /RecipeDetailView/);
    const detailView = read("components/recipe/RecipeDetailView.tsx");
    assert.match(detailView, /recipeJsonLd/);
    assert.match(detailView, /mode === "preview"[\s\S]*JsonLd|preview \? null : <JsonLd/);
    const previewPage = read("app/admin/(preview)/recipes/[id]/preview/page.tsx");
    assert.match(previewPage, /robots:\s*\{\s*index:\s*false/);
    assert.doesNotMatch(previewPage, /recipeJsonLd/);

    const result = runSiteHealthChecks(baseContext());
    assert.equal(result.checks.find((c) => c.id === "robots.private_surfaces")?.passed, true);
    assert.equal(result.checks.find((c) => c.id === "noindex.cooking_mode")?.passed, true);
    assert.equal(result.checks.find((c) => c.id === "canonical.videos_hub")?.passed, true);
  });

  it("27–33. canonical helpers and production host", () => {
    const seriesDetail = read("app/series/[slug]/page.tsx");
    assert.match(seriesDetail, /canonical:\s*`\/series\/\$\{/);
    const watch = read("app/videos/[videoId]/page.tsx");
    assert.match(watch, /canonical:\s*`\/videos\/\$\{/);
    const httpsOk = evaluateSiteUrlConfig({
      siteUrl: "https://mesakitchenstudio.com",
      productionLike: true,
    });
    assert.equal(httpsOk.length, 0);
    const httpBad = evaluateSiteUrlConfig({
      siteUrl: "http://mesakitchenstudio.com",
      productionLike: true,
    });
    assert.ok(httpBad.some((i) => i.id === "canonical.site_url_https"));
    const localHttpOk = evaluateSiteUrlConfig({
      siteUrl: "http://localhost:3000",
      productionLike: false,
    });
    assert.equal(localHttpOk.length, 0);
  });
});

describe("phase 6D — structured data", () => {
  it("34–40. Recipe JSON-LD shape, no fabricated ratings, cook omits schema", () => {
    const json = recipeJsonLd(sampleRecipe());
    const shape = validateRecipeJsonLdShape(json);
    assert.equal(shape.ok, true);
    assert.equal(Boolean(json.aggregateRating), false);

    const withStats = recipeJsonLd(sampleRecipe(), { count: 2, average: 4.5 });
    assert.ok(withStats.aggregateRating);

    const cook = read("app/recipes/[slug]/cook/page.tsx");
    assert.doesNotMatch(cook, /recipeJsonLd/);

    const result = runSiteHealthChecks(baseContext());
    assert.equal(result.checks.find((c) => c.id === "schema.recipe")?.passed, true);
    assert.equal(result.checks.find((c) => c.id === "schema.recipe_ratings")?.passed, true);
    assert.equal(result.checks.find((c) => c.id === "schema.cooking_mode")?.passed, true);
    assert.equal(result.checks.find((c) => c.id === "schema.video")?.passed, true);
  });
});

describe("phase 6D — internal links and media boundary", () => {
  it("41–48. Series relationships and homepage ownership", () => {
    const healthy = runSiteHealthChecks(baseContext());
    assert.equal(
      healthy.checks.find((c) => c.id === "internal_link.series_items")?.passed,
      true,
    );

    const broken = runSiteHealthChecks(
      baseContext({
        series: [
          {
            id: "s-bad",
            slug: "broken",
            title: "Broken",
            isPublished: true,
            items: [
              {
                id: "si-bad",
                removedFromPlaylist: false,
                recipeId: "draft-1",
                recipeStatus: "draft",
                youtubeVideoId: null,
                youtubePrivacyStatus: null,
              },
            ],
          },
        ],
      }),
    );
    assert.ok(broken.issues.some((i) => i.id === "internal_link.series_recipe"));

    const externalFallback = runSiteHealthChecks(
      baseContext({
        series: [
          {
            id: "s-ext",
            slug: "ext",
            title: "External ok",
            isPublished: true,
            items: [
              {
                id: "si-ext",
                removedFromPlaylist: false,
                recipeId: null,
                recipeStatus: null,
                youtubeVideoId: "abcdefghijk",
                youtubePrivacyStatus: "public",
              },
            ],
          },
        ],
      }),
    );
    assert.equal(
      externalFallback.issues.some((i) => i.id === "internal_link.series_recipe"),
      false,
    );

    assert.equal(
      healthy.checks.find((c) => c.id === "internal_link.homepage_ownership")?.passed,
      true,
    );
  });

  it("49–53. media boundary does not duplicate Content Health hero", () => {
    const result = runSiteHealthChecks(baseContext());
    assert.equal(
      result.checks.find((c) => c.id === "media.content_health_boundary")?.passed,
      true,
    );
    assert.equal(result.issues.some((i) => /hero/i.test(i.id)), false);
    assert.equal(result.issues.some((i) => /hero/i.test(i.title)), false);
  });
});

describe("phase 6D — admin UI, summary, side effects", () => {
  it("60–66. nav, page, auth, summary, grouping, no SEO score", () => {
    const nav = read("lib/admin-nav.ts");
    assert.match(nav, /\/admin\/site-health/);
    assert.match(nav, /Site Health/);

    const page = read("app/admin/(app)/site-health/page.tsx");
    assert.match(page, /requireAccess\("content"\)/);
    assert.match(page, /loadSiteHealth/);
    assert.match(page, /Needs attention/);
    assert.match(page, /Checks passing/);
    assert.doesNotMatch(page, /SEO score|Site health:\s*\d|keyword/i);
    assert.match(page, /AdminPageHeader|title="Site Health"/);

    const server = read("lib/site-health-server.ts");
    assert.match(server, /server-only/);
    assert.doesNotMatch(server, /recordAdminAuditEvent|createAdminNotification|createRecipeRevision/);
    assert.doesNotMatch(server, /fetch\(|SearchEvent|FunnelEvent/);

    const healthy = runSiteHealthChecks(baseContext());
    assert.equal(siteHealthStatusLabel(healthy.status), "Healthy");
    assert.ok(healthy.summary.checksPassing > 0);
    assert.doesNotMatch(JSON.stringify(healthy), /"seoScore"|healthScore/);

    const grouped = groupSiteHealthIssues([
      {
        id: "redirect.self",
        severity: "attention",
        category: "routing",
        title: "Self redirect",
        description: "a",
        entityId: "1",
      },
      {
        id: "redirect.self",
        severity: "attention",
        category: "routing",
        title: "Self redirect",
        description: "b",
        entityId: "2",
      },
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]?.count, 2);
  });

  it("54–59. wiring creates no mutation/audit/notification imports in health libs", () => {
    const pure = read("lib/site-health.ts");
    const server = read("lib/site-health-server.ts");
    for (const src of [pure, server]) {
      assert.doesNotMatch(src, /AdminAuditEvent|AdminNotification|RecipeRevision/);
      assert.doesNotMatch(src, /db\.(recipe|redirect)\.(create|update|delete)/);
    }
  });

  it("classifies known internal paths", () => {
    assert.equal(classifyInternalPublicPath("/recipes/x").kind, "recipe");
    assert.equal(classifyInternalPublicPath("/category/bread").kind, "category");
    assert.equal(classifyInternalPublicPath("/series/y").kind, "series");
    assert.equal(classifyInternalPublicPath("/ingredient/egg").kind, "ingredient");
    assert.equal(classifyInternalPublicPath("/custom").kind, "unknown");
  });

  it("does not invent numeric SEO scores or GSC/crawler hooks", () => {
    const pure = read("lib/site-health.ts");
    const page = read("app/admin/(app)/site-health/page.tsx");
    assert.doesNotMatch(pure, /PageSpeed|Lighthouse|keyword density|playwright/i);
    assert.doesNotMatch(page, /PageSpeed|Lighthouse|seoScore/i);
    assert.doesNotMatch(pure, /seoScore|healthScore|keywordDensity/);
    assert.doesNotMatch(page, /Search Console API|impressions|average position/i);
  });

  it("sitemap and robots share extracted builders", () => {
    const sitemap = read("app/sitemap.ts");
    const robots = read("app/robots.ts");
    assert.match(sitemap, /buildSitemapEntries/);
    assert.match(robots, /publicRobotsDisallow/);
  });
});
