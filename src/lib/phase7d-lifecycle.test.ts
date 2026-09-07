import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCalendarReadinessInput,
  calendarScheduledReadinessFromCanonical,
} from "@/lib/content-calendar/readiness";
import {
  collectPathsForRecipe,
  isRecipeCookPath,
  resolvePerformancePath,
  type PerformanceIdentityContext,
} from "@/lib/content-performance/identity";
import { aggregateGoogleFromRows } from "@/lib/content-performance/gsc";
import { canAccess, canManageSearchConsole, canViewSearchConsole } from "@/lib/admin-access";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { getRecipeContentHealth, mapReadinessToContentHealthStatus } from "@/lib/recipe-content-health";
import {
  getRecipePublishingReadiness,
  publishingCheckIdForField,
} from "@/lib/recipe-publishing-readiness";
import {
  decideScheduledRecipePublish,
  scheduleFailureClearsSchedule,
} from "@/lib/recipe-schedule";
import { publicRobotsDisallow } from "@/lib/robots-policy";
import { aggregateSearchConsoleKpis } from "@/lib/search-console/aggregate";
import { recipePublicPath } from "@/lib/redirects";

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.join(srcRoot, "..");

function read(rel: string) {
  return readFileSync(path.join(srcRoot, rel), "utf8");
}

function readRepo(rel: string) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

/** Frozen 7D fixture set — isolated representative data shapes (no DB mutation). */
const FIXTURE = {
  now: new Date("2026-09-11T12:00:00.000Z"),
  typeFields: [
    { key: "image", label: "Hero image", kind: "image", required: true, helpText: "", options: "[]" },
    { key: "imageAlt", label: "Image alt", kind: "text", required: true, helpText: "", options: "[]" },
    { key: "intro", label: "Intro", kind: "textarea", required: true, helpText: "", options: "[]" },
    {
      key: "ingredients",
      label: "Ingredients",
      kind: "ingredients",
      required: true,
      helpText: "",
      options: "[]",
    },
    {
      key: "instructions",
      label: "Instructions",
      kind: "instructions",
      required: true,
      helpText: "",
      options: "[]",
    },
    { key: "prepMinutes", label: "Prep", kind: "minutes", required: true, helpText: "", options: "[]" },
    { key: "servings", label: "Servings", kind: "number", required: true, helpText: "", options: "[]" },
    {
      key: "customTechnique",
      label: "Technique note",
      kind: "text",
      required: true,
      helpText: "Required type field",
      options: "[]",
    },
  ],
  completeValues: {
    image: "https://example.public.blob.vercel-storage.com/baguette.jpg",
    heroMediaAssetId: "media-hero-a",
    imageAlt: "Baguettes",
    intro: "A classic loaf.",
    ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
    instructions: [{ title: "Mix", steps: ["Mix", "Bake"] }],
    prepMinutes: 20,
    servings: 4,
    customTechnique: "Prefer steam for the first 10 minutes.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  recipeA: { id: "recipe-a", title: "Ready Flatbread", slug: "ready-flatbread", status: "draft" },
  recipeB: { id: "recipe-b", title: "Blocked Flatbread", slug: "blocked-flatbread", status: "draft" },
  recipeC: {
    id: "recipe-c",
    title: "Renamed Loaf",
    slug: "slug-c",
    status: "published",
    historicalSlugs: ["slug-a", "slug-b", "slug-c"] as const,
  },
  recipeD: { id: "recipe-d", title: "Recommendations Only", slug: "recs-only", status: "published" },
} as const;

describe("phase 7D — migration / build deployment path", () => {
  it("ships two-step Postgres migration chain without destructive delta SQL", () => {
    const migrationsDir = path.join(repoRoot, "prisma/migrations");
    assert.equal(existsSync(migrationsDir), true);
    assert.equal(existsSync(path.join(migrationsDir, "migration_lock.toml")), true);
    const dirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    assert.ok(dirs.includes("20260908000000_baseline_existing_production"));
    assert.ok(dirs.includes("20260908001000_roadmap_additive_delta"));
    assert.ok(!dirs.some((name) => name.includes("baseline_mesa_roadmap")));

    const legacy = readRepo(
      "prisma/migrations/20260908000000_baseline_existing_production/migration.sql",
    );
    const delta = readRepo(
      "prisma/migrations/20260908001000_roadmap_additive_delta/migration.sql",
    );
    assert.match(legacy, /CREATE TABLE/);
    assert.doesNotMatch(legacy, /\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
    assert.doesNotMatch(delta, /\bDROP TABLE\b|\bDROP COLUMN\b|\bTRUNCATE\b|\bDELETE FROM\b/i);

    for (const table of [
      "MediaAsset",
      "AdminNotification",
      "AdminNotificationReceipt",
      "SearchConsoleConnection",
      "SearchConsolePageMetric",
      "SearchConsoleQueryMetric",
      "RecipeRevision",
      "Redirect",
      "SearchEvent",
      "SavedRecipeCollection",
    ]) {
      assert.match(delta, new RegExp(`CREATE TABLE "${table}"`));
      assert.doesNotMatch(legacy, new RegExp(`CREATE TABLE "${table}"`));
    }
    assert.match(delta, /ALTER TABLE "Recipe"[\s\S]*"scheduledPublishAt"/);
    assert.match(delta, /ALTER TABLE "RecipeSave"[\s\S]*"recipeId"/);
    assert.match(delta, /ALTER TABLE "RecipeReview"[\s\S]*"recipeId"/);
    assert.match(delta, /ALTER TABLE "YouTubeRelease"[\s\S]*"recipeId"/);
    assert.match(delta, /YouTubeRelease_recipeId_fkey[\s\S]*ON DELETE SET NULL/);
    assert.match(delta, /YouTubeRelease_recipeId_idx/);
  });

  it("production build uses guarded migrate deploy and never accept-data-loss", () => {
    const pkg = JSON.parse(readRepo("package.json")) as { scripts: Record<string, string> };
    assert.match(pkg.scripts.build, /migrate-on-build\.mjs/);
    assert.doesNotMatch(pkg.scripts.build, /accept-data-loss/);
    assert.match(pkg.scripts.build, /next build/);
    const guard = readRepo("prisma/migrate-on-build.mjs");
    assert.match(guard, /VERCEL_ENV/);
    assert.match(guard, /migrate deploy/);
    assert.match(guard, /production/);
    assert.match(guard, /Skipping migrate deploy/);
  });

  it("documents legacy resolve then additive deploy for existing Neon DBs", () => {
    const readme = readRepo("README.md");
    assert.match(readme, /20260908000000_baseline_existing_production/);
    assert.match(readme, /20260908001000_roadmap_additive_delta/);
    assert.match(readme, /migrate resolve --applied 20260908000000_baseline_existing_production/);
    assert.match(readme, /Do not run `prisma db push --accept-data-loss`/);
    assert.doesNotMatch(readme, /baseline_mesa_roadmap/);
  });
});

describe("phase 7D — architecture ownership guards", () => {
  it("schema has no generic Content / CalendarEvent / score persistence", () => {
    const schema = readRepo("prisma/schema.prisma");
    assert.doesNotMatch(schema, /^model Content\b/m);
    assert.doesNotMatch(schema, /^model CalendarEvent\b/m);
    assert.doesNotMatch(schema, /^model UnifiedMetric\b/m);
    assert.doesNotMatch(schema, /ContentPerformanceScore|ContentHealthScore|SiteHealthIssue/);
    assert.match(schema, /model YouTubeRelease/);
    assert.match(schema, /recipeId\s+String\?/);
    assert.match(schema, /onDelete: SetNull/);
  });

  it("forbids blended/composite score identifiers in product code", () => {
    const roots = [
      "lib/content-performance",
      "lib/content-calendar",
      "lib/search-console",
      "lib/recipe-content-health.ts",
      "lib/site-health.ts",
      "lib/media-asset.ts",
    ];
    const forbidden =
      /healthScore|seoScore|contentScore|performanceScore|opportunityScore|reachScore|engagementScore|momentumScore|totalReach|combinedViews|overallPerformance/;
    for (const rel of roots) {
      const full = path.join(srcRoot, rel);
      if (!existsSync(full)) continue;
      if (full.endsWith(".ts")) {
        assert.doesNotMatch(read(rel), forbidden);
        continue;
      }
      for (const name of readdirSync(full)) {
        if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
        assert.doesNotMatch(readFileSync(path.join(full, name), "utf8"), forbidden, rel + "/" + name);
      }
    }
  });

  it("phase 6–7 intelligence paths do not import product AI SDKs", () => {
    const files = [
      "lib/recipe-content-health.ts",
      "lib/site-health.ts",
      "lib/media-asset.ts",
      "lib/media-asset-server.ts",
      "lib/content-calendar/load.ts",
      "lib/content-performance/dashboard.ts",
      "lib/search-console/sync.ts",
      "lib/search-console/oauth.ts",
    ];
    const ai = /@google\/genai|openai|anthropic|from ["']openai|claude|gemini/i;
    for (const file of files) {
      assert.doesNotMatch(read(file), ai, file);
    }
  });
});

describe("phase 7D — readiness parity matrix (fixtures A–D + blockers)", () => {
  function parityBundle(input: ReturnType<typeof buildCalendarReadinessInput>) {
    const direct = getRecipePublishingReadiness(input);
    const calendar = calendarScheduledReadinessFromCanonical(input);
    const healthDraft = mapReadinessToContentHealthStatus("draft", direct.status);
    const healthPublished = mapReadinessToContentHealthStatus("published", direct.status);
    const cron = decideScheduledRecipePublish({
      status: "draft",
      scheduledPublishAt: new Date("2020-01-01T00:00:00.000Z"),
      readinessStatus: direct.status,
      now: FIXTURE.now,
    });
    return { direct, calendar, healthDraft, healthPublished, cron };
  }

  it("A. fully ready Recipe — ready everywhere; cron publishable; Calendar no attention", () => {
    const input = buildCalendarReadinessInput({
      title: FIXTURE.recipeA.title,
      slug: FIXTURE.recipeA.slug,
      excerpt: "Crispy edges.",
      typeId: "type-custom",
      values: FIXTURE.completeValues,
      categoryIds: ["cat-1"],
      typeFields: [...FIXTURE.typeFields],
    });
    const { direct, calendar, healthDraft, cron } = parityBundle(input);
    assert.equal(direct.status, "ready");
    assert.equal(calendar.status, "ready");
    assert.equal(calendar.needsAttention, false);
    assert.equal(healthDraft, "draft_ready");
    assert.equal(cron.action, "publish");
  });

  it("B. missing required RecipeTypeField — not_ready parity across editor/health/calendar/cron", () => {
    const values = { ...FIXTURE.completeValues, customTechnique: "" };
    const input = buildCalendarReadinessInput({
      title: FIXTURE.recipeB.title,
      slug: FIXTURE.recipeB.slug,
      excerpt: "Needs technique.",
      typeId: "type-custom",
      values,
      categoryIds: ["cat-1"],
      typeFields: [...FIXTURE.typeFields],
    });
    const { direct, calendar, healthDraft, cron } = parityBundle(input);
    const expectedId = publishingCheckIdForField("customTechnique");
    assert.equal(direct.status, "not_ready");
    assert.equal(calendar.status, "not_ready");
    assert.equal(calendar.needsAttention, true);
    assert.ok(calendar.failedCheckIds.includes(expectedId));
    assert.equal(healthDraft, "draft_not_ready");
    assert.equal(cron.action, "fail");
    assert.equal(scheduleFailureClearsSchedule("deterministic"), true);
    assert.equal(scheduleFailureClearsSchedule("transient"), false);

    const health = getRecipeContentHealth({
      recipeId: FIXTURE.recipeB.id,
      title: FIXTURE.recipeB.title,
      slug: FIXTURE.recipeB.slug,
      publicationStatus: "draft",
      typeId: "type-custom",
      typeName: "Custom",
      updatedAt: FIXTURE.now,
      readinessInput: input,
    });
    assert.equal(health.health, "draft_not_ready");
    assert.equal(health.readinessStatus, "not_ready");
  });

  it("C. recommendation-only — nonblocking everywhere", () => {
    const values = { ...FIXTURE.completeValues, youtubeUrl: "" };
    const input = buildCalendarReadinessInput({
      title: FIXTURE.recipeD.title,
      slug: FIXTURE.recipeD.slug,
      excerpt: "",
      typeId: "type-custom",
      values,
      categoryIds: [],
      typeFields: [...FIXTURE.typeFields],
    });
    const { direct, calendar, healthDraft, healthPublished, cron } = parityBundle(input);
    assert.equal(direct.status, "ready_with_recommendations");
    assert.equal(calendar.status, "ready_with_recommendations");
    assert.equal(calendar.needsAttention, false);
    assert.equal(healthDraft, "draft_recommendations");
    assert.equal(healthPublished, "recommendations");
    assert.equal(cron.action, "publish");
  });

  it("D. missing title / malformed YouTube — required blockers", () => {
    const missingTitle = parityBundle(
      buildCalendarReadinessInput({
        title: "",
        slug: "no-title",
        excerpt: "x",
        typeId: "type-custom",
        values: FIXTURE.completeValues,
        categoryIds: ["cat-1"],
        typeFields: [...FIXTURE.typeFields],
      }),
    );
    assert.equal(missingTitle.direct.status, "not_ready");
    assert.equal(missingTitle.calendar.needsAttention, true);
    assert.equal(missingTitle.cron.action, "fail");

    const badYt = parityBundle(
      buildCalendarReadinessInput({
        title: "Bad YT",
        slug: "bad-yt",
        excerpt: "x",
        typeId: "type-custom",
        values: { ...FIXTURE.completeValues, youtubeUrl: "https://example.com/not-youtube" },
        categoryIds: ["cat-1"],
        typeFields: [...FIXTURE.typeFields],
      }),
    );
    assert.equal(badYt.direct.status, "not_ready");
    assert.equal(badYt.cron.action, "fail");
  });
});

describe("phase 7D — double slug rename identity + GSC aggregation", () => {
  it("historical slug-a/b/c resolve to one Recipe.id; unresolved paths stay unresolved", () => {
    const recipe = {
      id: FIXTURE.recipeC.id,
      slug: FIXTURE.recipeC.slug,
      title: FIXTURE.recipeC.title,
      status: "published",
    };
    const ctx: PerformanceIdentityContext = {
      recipesBySlug: new Map([[recipe.slug, recipe]]),
      recipesById: new Map([[recipe.id, recipe]]),
      seriesBySlug: new Map(),
      seriesById: new Map(),
      redirectToByFrom: new Map([
        ["/recipes/slug-a", "/recipes/slug-c"],
        ["/recipes/slug-b", "/recipes/slug-c"],
      ]),
    };

    for (const slug of FIXTURE.recipeC.historicalSlugs) {
      const resolved = resolvePerformancePath(`/recipes/${slug}`, ctx);
      assert.equal(resolved.status, "resolved");
      if (resolved.status === "resolved") {
        assert.equal(resolved.entity.kind, "recipe");
        if (resolved.entity.kind === "recipe") {
          assert.equal(resolved.entity.recipeId, recipe.id);
        }
      }
    }

    const collected = collectPathsForRecipe(
      recipe.id,
      ["/recipes/slug-a", "/recipes/slug-b", "/recipes/slug-c", "/recipes/ghost", "/videos"],
      ctx,
    );
    assert.deepEqual(collected, ["/recipes/slug-a", "/recipes/slug-b", "/recipes/slug-c"]);

    const unresolved = resolvePerformancePath("/recipes/orphan-history", ctx);
    assert.equal(unresolved.status, "unresolved");

    const cycleCtx: PerformanceIdentityContext = {
      ...ctx,
      redirectToByFrom: new Map([
        ["/recipes/loop-a", "/recipes/loop-b"],
        ["/recipes/loop-b", "/recipes/loop-a"],
      ]),
    };
    const cycle = resolvePerformancePath("/recipes/loop-a", cycleCtx);
    assert.equal(cycle.status, "unresolved");
  });

  it("Cooking Mode paths are excluded from ordinary Recipe page-view identity", () => {
    assert.equal(isRecipeCookPath("/recipes/slug-c/cook"), true);
    assert.equal(isRecipeCookPath("/recipes/slug-c"), false);
  });
});

describe("phase 7D — GSC metric math shared + query boundary", () => {
  it("CTR/position use sum + impression-weighted helpers (not naïve mean)", () => {
    const rows = [
      { clicks: 1, impressions: 100, position: 1 },
      { clicks: 9, impressions: 900, position: 10 },
    ];
    const kpis = aggregateSearchConsoleKpis(rows);
    assert.equal(kpis.clicks, 10);
    assert.equal(kpis.impressions, 1000);
    assert.equal(kpis.ctr, 0.01);
    // Impression-weighted: (1*100 + 10*900) / 1000 = 9.1 — not mean of 1 and 10 (=5.5)
    assert.equal(kpis.position, 9.1);
    assert.notEqual(kpis.position, (1 + 10) / 2);

    const reused = aggregateGoogleFromRows(
      rows.map((row) => ({ ...row, date: "2026-09-01", pageUrl: "https://x/a", normalizedPath: "/a" })),
      ["/a"],
      true,
    );
    assert.equal(reused.clicks, kpis.clicks);
    assert.equal(reused.impressions, kpis.impressions);
    assert.equal(reused.ctr, kpis.ctr);
    assert.equal(reused.position, kpis.position);
  });

  it("Recipe performance detail does not invent page×query Recipe queries", () => {
    const detail = read("app/admin/(app)/content-performance/recipes/[id]/page.tsx");
    assert.doesNotMatch(detail, /Queries for this Recipe/i);
    assert.doesNotMatch(detail, /SearchConsoleQueryMetric/);
    const gsc = read("lib/content-performance/gsc.ts");
    assert.doesNotMatch(gsc, /queryMetrics|SearchConsoleQueryMetric/);
  });
});

describe("phase 7D — Calendar / sitemap / robots / cron ownership", () => {
  it("Calendar loader is source-derived with batched type fields and no performance queries", () => {
    const load = read("lib/content-calendar/load.ts");
    assert.match(load, /loadTypeFieldsByTypeId/);
    assert.match(load, /typeId: \{ in: typeIds \}/);
    assert.match(load, /calendarScheduledReadinessFromCanonical/);
    assert.doesNotMatch(load, /fields:\s*\[\s*\]/);
    assert.doesNotMatch(load, /from ["']@\/lib\/(search-console|content-performance|funnel-analytics)/);
    assert.doesNotMatch(load, /GuestPageView|SearchConsolePageMetric|FunnelEvent/);
    // Optional View Performance link is navigation only.
    assert.match(load, /performanceHref/);
  });

  it("sitemap and robots share single policy owners", () => {
    assert.match(read("app/sitemap.ts"), /buildSitemapEntries/);
    assert.match(read("lib/site-health.ts"), /buildSitemapEntries/);
    assert.match(read("app/robots.ts"), /publicRobotsDisallow/);
    assert.match(read("lib/site-health.ts"), /publicRobotsDisallow/);
    const disallow = publicRobotsDisallow(false);
    assert.ok(disallow.some((rule) => rule === "/admin" || rule === "/admin/"));
    assert.ok(disallow.some((rule) => rule.startsWith("/api")));
    assert.ok(disallow.some((rule) => rule.startsWith("/profile")));
  });

  it("cron routes use Bearer auth; recipe-publish uses dedicated secret", () => {
    for (const route of [
      "app/api/cron/search-console/route.ts",
      "app/api/cron/youtube-sync/route.ts",
      "app/api/cron/guest-retention/route.ts",
    ]) {
      assert.match(read(route), /authorizeCronRequest/);
    }
    assert.match(read("app/api/cron/recipe-publish/route.ts"), /authorizeRecipePublishCronRequest/);
    const env = { CRON_SECRET: "test-secret" };
    assert.equal(
      authorizeCronRequest(new Request("https://x", { headers: { authorization: "Bearer test-secret" } }), env)
        .ok,
      true,
    );
    assert.equal(authorizeCronRequest(new Request("https://x?secret=test-secret"), env).ok, false);
    assert.equal(authorizeCronRequest(new Request("https://x"), env).ok, false);
  });
});

describe("phase 7D — permissions + public boundary", () => {
  it("source-aware admin permission matrix", () => {
    assert.equal(canAccess("owner", "content"), true);
    assert.equal(canAccess("owner", "youtube"), true);
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("editor", "youtube"), true);
    assert.equal(canAccess("members", "content"), false);
    assert.equal(canAccess("members", "youtube"), false);
    assert.equal(canManageSearchConsole("owner"), true);
    assert.equal(canManageSearchConsole("editor"), false);
    assert.equal(canViewSearchConsole("editor"), true);
    assert.equal(canViewSearchConsole("members"), false);
    // Role model has no youtube-only Admin — youtube rides editor/owner.
  });

  it("public app routes do not import Admin intelligence loaders", () => {
    const publicFiles = [
      "app/page.tsx",
      "app/recipes/page.tsx",
      "app/recipes/[slug]/page.tsx",
      "app/recipes/[slug]/cook/page.tsx",
      "app/series/page.tsx",
      "app/series/[slug]/page.tsx",
      "app/videos/page.tsx",
      "app/videos/[videoId]/page.tsx",
      "app/profile/page.tsx",
    ];
    const forbidden =
      /content-performance|content-calendar|recipe-content-health|site-health-server|search-console\/|admin-notifications-server|media-asset-server/;
    for (const file of publicFiles) {
      assert.doesNotMatch(read(file), forbidden, file);
    }
  });

  it("recipe public path helper remains slug-based while identity is id-stable", () => {
    assert.equal(recipePublicPath("slug-c"), "/recipes/slug-c");
    assert.notEqual(FIXTURE.recipeC.id, FIXTURE.recipeC.slug);
  });
});

describe("phase 7D — revision / audit / notification side-effect wiring", () => {
  it("RecipeRevision hash excludes slug/status/publication; schedule publish is content-hash no-op", () => {
    const revisions = read("lib/recipe-revisions.ts");
    assert.match(revisions, /excludes slug\/status\/publishedAt|Hash of recoverable content/i);
    const scheduleServer = read("lib/recipe-schedule-server.ts");
    // Publication may call the revision helper; content-unchanged must no-op (no duplicate).
    assert.match(scheduleServer, /createRecipeRevisionIfChanged should no-op when content is unchanged/);
    assert.match(scheduleServer, /createRecipeRevisionIfChanged/);
    const calendarLoad = read("lib/content-calendar/load.ts");
    assert.doesNotMatch(calendarLoad, /createRecipeRevisionIfChanged|recordAdminAuditEvent|createAdminNotification/);
    const perfDash = read("lib/content-performance/dashboard.ts");
    assert.doesNotMatch(perfDash, /createRecipeRevisionIfChanged|recordAdminAuditEvent|createAdminNotification/);
  });

  it("Admin nav places Calendar under Publishing and Performance under Analytics", () => {
    const nav = read("lib/admin-nav.ts");
    assert.match(nav, /Publishing[\s\S]*content-calendar/);
    assert.match(nav, /Analytics[\s\S]*content-performance/);
    assert.match(nav, /Analytics[\s\S]*search-console/);
  });
});
