import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getRecipeContentHealth, issuesFromReadiness } from "./recipe-content-health.ts";
import { getRecipePublishingReadiness } from "./recipe-publishing-readiness.ts";
import {
  defaultSiteHealthPolicyFacts,
  runSiteHealthChecks,
  type SiteHealthContext,
} from "./site-health.ts";
import { scheduleFailureClearsSchedule } from "./recipe-schedule.ts";
import { RECIPE_HERO_MEDIA_ASSET_ID_KEY } from "./media-asset.ts";
import {
  buildSitemapEntries,
  sitemapPathnamesFromEntries,
} from "./sitemap-entries.ts";
import { publicRobotsDisallow } from "./robots-policy.ts";
import { contentPayloadForHash, hashRecipeRevisionSnapshot } from "./recipe-revisions.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

const requiredFields = [
  { key: "image", label: "Hero image", kind: "image", required: true },
  { key: "imageAlt", label: "Image alt", kind: "text", required: true },
  { key: "intro", label: "Intro", kind: "textarea", required: true },
  { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
  { key: "instructions", label: "Instructions", kind: "instructions", required: true },
  { key: "prepMinutes", label: "Prep", kind: "minutes", required: true },
  { key: "servings", label: "Servings", kind: "number", required: true },
];

const readyValues = {
  image: "https://example.public.blob.vercel-storage.com/a.jpg",
  imageAlt: "Loaf",
  intro: "A classic loaf.",
  ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
  instructions: [{ title: "Mix", steps: ["Mix", "Bake"] }],
  prepMinutes: 20,
  servings: 4,
  youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
};

/** Representative Phase 6E fixture matrix (in-memory). */
const fixtures = {
  A: { id: "a", title: "Ready Published", slug: "a-ready", status: "published", values: readyValues },
  B: {
    id: "b",
    title: "Published Recommendations",
    slug: "b-recs",
    status: "published",
    values: { ...readyValues, youtubeUrl: "" },
    excerpt: "",
  },
  C: {
    id: "c",
    title: "Published Not Ready",
    slug: "c-blocked",
    status: "published",
    values: { ...readyValues, intro: "" },
  },
  D: { id: "d", title: "Draft Ready", slug: "d-draft-ready", status: "draft", values: readyValues },
  E: {
    id: "e",
    title: "Draft Not Ready",
    slug: "e-draft-blocked",
    status: "draft",
    values: { ...readyValues, intro: "" },
  },
  F: {
    id: "f",
    title: "Scheduled Future",
    slug: "f-scheduled",
    status: "draft",
    values: readyValues,
    scheduledPublishAt: "2026-12-01T10:00:00.000Z",
  },
  G: {
    id: "g",
    title: "Scheduled Due Not Ready",
    slug: "g-due-blocked",
    status: "draft",
    values: { ...readyValues, intro: "" },
    scheduledPublishAt: "2026-01-01T00:00:00.000Z",
  },
  H: {
    id: "h",
    title: "Transient Retry Candidate",
    slug: "h-retry",
    status: "draft",
    values: readyValues,
    scheduledPublishAt: "2026-01-01T00:00:00.000Z",
  },
} as const;

function readinessFor(fixture: {
  title: string;
  slug: string;
  values: Record<string, unknown>;
  excerpt?: string;
}) {
  return getRecipePublishingReadiness({
    title: fixture.title,
    slug: fixture.slug,
    excerpt: fixture.excerpt ?? "Soft crumb.",
    typeId: "t1",
    fields: requiredFields,
    values: fixture.values,
  });
}

function contentHealthFor(fixture: {
  id: string;
  title: string;
  slug: string;
  status: string;
  values: Record<string, unknown>;
  excerpt?: string;
}) {
  return getRecipeContentHealth({
    recipeId: fixture.id,
    title: fixture.title,
    slug: fixture.slug,
    publicationStatus: fixture.status,
    typeId: "t1",
    typeName: "Bread",
    updatedAt: "2026-01-02T00:00:00.000Z",
    readinessInput: {
      title: fixture.title,
      slug: fixture.slug,
      excerpt: fixture.excerpt ?? "Soft crumb.",
      typeId: "t1",
      fields: requiredFields,
      values: fixture.values,
    },
  });
}

function siteContext(overrides: Partial<SiteHealthContext> = {}): SiteHealthContext {
  return {
    siteUrl: "https://mesakitchenstudio.com",
    sitePrivate: false,
    studioPublicLaunchEnabled: false,
    productionLike: true,
    redirects: [],
    recipes: Object.values(fixtures).map((f) => ({
      id: f.id,
      slug: f.slug,
      title: f.title,
      status: f.status,
      scheduledPublishAt: "scheduledPublishAt" in f ? f.scheduledPublishAt : null,
      updatedAt: "2026-01-02T00:00:00.000Z",
    })),
    categories: [{ id: "cat1", slug: "bread", name: "Bread" }],
    series: [
      {
        id: "series1",
        slug: "weekend",
        title: "Weekend",
        isPublished: true,
        items: [
          {
            id: "si1",
            removedFromPlaylist: false,
            recipeId: "a",
            recipeStatus: "published",
            youtubeVideoId: null,
            youtubePrivacyStatus: null,
          },
          {
            id: "si2",
            removedFromPlaylist: false,
            recipeId: null,
            recipeStatus: null,
            youtubeVideoId: "abcdefghijk",
            youtubePrivacyStatus: "public",
          },
        ],
      },
    ],
    studioLessons: [],
    policy: defaultSiteHealthPolicyFacts(),
    ...overrides,
  };
}

describe("phase 6E — ownership map wiring", () => {
  it("keeps Publishing Readiness as sole publication validator for schedule + save", () => {
    const actions = read("app/admin/actions.ts");
    const scheduleServer = read("lib/recipe-schedule-server.ts");
    const contentHealth = read("lib/recipe-content-health.ts");
    assert.match(actions, /getRecipePublishingReadiness/);
    assert.match(scheduleServer, /getRecipePublishingReadiness/);
    assert.match(contentHealth, /getRecipePublishingReadiness/);
    assert.doesNotMatch(contentHealth, /validateRecipeForPublish\(/);
  });

  it("keeps Phase 6 Admin routes under content access and nav IA", () => {
    const nav = read("lib/admin-nav.ts");
    assert.match(nav, /\/admin\/content-health/);
    assert.match(nav, /\/admin\/site-health/);
    assert.match(nav, /\/admin\/notifications/);
    assert.match(nav, /\/admin\/media/);
    for (const page of [
      "app/admin/(app)/content-health/page.tsx",
      "app/admin/(app)/site-health/page.tsx",
      "app/admin/(app)/notifications/page.tsx",
      "app/admin/(app)/media/page.tsx",
    ]) {
      assert.match(read(page), /requireAccess\("content"\)/);
    }
  });

  it("uses shared sitemap and robots owners", () => {
    assert.match(read("app/sitemap.ts"), /buildSitemapEntries/);
    assert.match(read("app/robots.ts"), /publicRobotsDisallow/);
    assert.match(read("lib/site-health.ts"), /buildSitemapEntries|sitemapPathnamesFromEntries/);
    assert.match(read("lib/site-health.ts"), /publicRobotsDisallow/);
  });
});

describe("phase 6E — readiness ↔ Content Health parity", () => {
  it("matches readiness status and issue ids for all representative fixtures", () => {
    for (const fixture of Object.values(fixtures)) {
      const readiness = readinessFor(fixture);
      const health = contentHealthFor(fixture);
      assert.equal(health.readinessStatus, readiness.status, fixture.id);
      assert.deepEqual(
        issuesFromReadiness(readiness).map((i) => i.id).sort(),
        health.issues.map((i) => i.id).sort(),
        fixture.id,
      );
    }
  });

  it("maps published/draft health states without inventing scores", () => {
    assert.equal(contentHealthFor(fixtures.A).health, "healthy");
    assert.equal(contentHealthFor(fixtures.B).health, "recommendations");
    assert.equal(contentHealthFor(fixtures.C).health, "needs_attention");
    assert.equal(contentHealthFor(fixtures.D).health, "draft_ready");
    assert.equal(contentHealthFor(fixtures.E).health, "draft_not_ready");
    assert.equal(contentHealthFor(fixtures.G).health, "draft_not_ready");
  });
});

describe("phase 6E — Content Health ↔ Site Health boundary", () => {
  it("does not re-flag missing Recipe hero in Site Health", () => {
    const result = runSiteHealthChecks(siteContext());
    assert.equal(result.issues.some((i) => /hero/i.test(i.id) || /hero/i.test(i.title)), false);
    assert.equal(
      result.checks.find((c) => c.id === "media.content_health_boundary")?.passed,
      true,
    );
  });

  it("treats scheduled drafts like drafts for sitemap membership", () => {
    const published = Object.values(fixtures).filter((f) => f.status === "published");
    const entries = buildSitemapEntries({
      siteUrl: "https://mesakitchenstudio.com",
      recipes: published.map((f) => ({ slug: f.slug, updatedAt: "2026-01-02T00:00:00.000Z" })),
      categories: [{ slug: "bread" }],
      series: [{ slug: "weekend" }],
    });
    const paths = new Set(
      sitemapPathnamesFromEntries(entries, "https://mesakitchenstudio.com"),
    );
    assert.ok(paths.has("/recipes/a-ready"));
    assert.equal(paths.has("/recipes/f-scheduled"), false);
    assert.equal(paths.has("/recipes/g-due-blocked"), false);
    assert.equal(paths.has("/recipes/d-draft-ready"), false);

    const health = runSiteHealthChecks(siteContext());
    assert.equal(health.checks.find((c) => c.id === "sitemap.draft_excluded")?.passed, true);
  });
});

describe("phase 6E — health ↔ notifications / side-effect boundaries", () => {
  it("Content Health and Site Health libs never create notifications/audit/revisions", () => {
    for (const file of [
      "lib/recipe-content-health.ts",
      "lib/recipe-content-health-server.ts",
      "lib/site-health.ts",
      "lib/site-health-server.ts",
    ]) {
      const src = read(file);
      assert.doesNotMatch(src, /createAdminNotification|recordAdminAuditEvent|createRecipeRevision/);
      assert.doesNotMatch(src, /db\.(recipe|redirect)\.(create|update|delete)/);
    }
  });

  it("notification read/dismiss actions do not audit or revise", () => {
    const actions = read("app/admin/notification-actions.ts");
    assert.doesNotMatch(actions, /recordAdminAuditEvent|createRecipeRevision/);
    assert.match(actions, /markNotificationReadAction|dismissNotificationAction/);
  });

  it("cron uses failure-clear helper and claim concurrency guard", () => {
    const server = read("lib/recipe-schedule-server.ts");
    assert.match(server, /scheduleFailureClearsSchedule\("deterministic"\)/);
    assert.match(server, /scheduleFailureClearsSchedule\("transient"\)/);
    assert.match(server, /claimScheduledRecipePublish/);
    assert.doesNotMatch(server, /force:\s*true/);
    assert.equal(scheduleFailureClearsSchedule("deterministic"), true);
    assert.equal(scheduleFailureClearsSchedule("transient"), false);
  });
});

describe("phase 6E — Media ↔ readiness / revision ownership", () => {
  it("does not require heroMediaAssetId for readiness", () => {
    const legacy = readinessFor({
      title: "Legacy",
      slug: "legacy",
      values: readyValues,
    });
    assert.equal(legacy.status, "ready");
    assert.equal(
      legacy.required.some((c) => c.id.includes("media_asset") || c.fieldKey === RECIPE_HERO_MEDIA_ASSET_ID_KEY),
      false,
    );
  });

  it("content hash excludes publication-only state", () => {
    const base = {
      version: 1 as const,
      title: "X",
      excerpt: "Y",
      featured: false,
      seasonal: false,
      typeId: "t1",
      categoryIds: ["c1"],
      values: "{}",
      slug: "old",
      status: "draft",
      publishedAt: null as string | null,
      publicUpdateNote: null as string | null,
      publicUpdatedAt: null as string | null,
    };
    const a = hashRecipeRevisionSnapshot(base);
    const b = hashRecipeRevisionSnapshot({
      ...base,
      slug: "new",
      status: "published",
      publishedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(a, b);
    const payload = JSON.stringify(contentPayloadForHash(base));
    assert.doesNotMatch(payload, /"slug"|publishedAt|"status"/);
  });
});

describe("phase 6E — category canonical decision", () => {
  it("Category pages declare explicit canonical and remain query-free", () => {
    const page = read("app/category/[slug]/page.tsx");
    assert.match(page, /alternates:\s*\{\s*canonical:\s*path\s*\}/);
    assert.doesNotMatch(page, /searchParams/);
    assert.match(page, /getCategoryBySlug|getRecipesByCategory/);
    assert.match(page, /isCategoryIndexable/);
  });
});

describe("phase 6E — no scores / no Phase 7 / public boundary", () => {
  it("Phase 6 surfaces have no numeric SEO/health scores or GSC/AI SEO", () => {
    for (const file of [
      "lib/recipe-content-health.ts",
      "lib/site-health.ts",
      "app/admin/(app)/content-health/page.tsx",
      "app/admin/(app)/site-health/page.tsx",
      "lib/media-asset.ts",
      "lib/recipe-schedule.ts",
    ]) {
      const src = read(file);
      assert.doesNotMatch(src, /healthScore|seoScore|contentScore|siteScore/);
      assert.doesNotMatch(src, /Search Console API|PageSpeed|Lighthouse|Ahrefs|Semrush/i);
    }
  });

  it("public recipe/video/series pages do not import Admin intelligence servers", () => {
    for (const file of [
      "app/recipes/[slug]/page.tsx",
      "app/recipes/page.tsx",
      "app/videos/page.tsx",
      "app/videos/[videoId]/page.tsx",
      "app/series/[slug]/page.tsx",
      "app/recipes/[slug]/cook/page.tsx",
    ]) {
      const src = read(file);
      assert.doesNotMatch(
        src,
        /content-health-server|site-health-server|admin-notifications-server|recipe-schedule-server|media-asset-server/,
      );
    }
  });

  it("robots policy still protects Admin surfaces used by Phase 6", () => {
    const disallow = publicRobotsDisallow(false);
    assert.ok(disallow.some((r) => r.startsWith("/admin")));
    assert.ok(disallow.some((r) => r.startsWith("/api")));
    assert.ok(disallow.some((r) => r.startsWith("/profile")));
  });

  it("schema has no persisted health/score models", () => {
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /model (ContentHealth|SiteHealth|SeoIssue|SeoHealth|HealthScore)/);
    assert.match(schema, /model MediaAsset/);
    assert.match(schema, /model AdminNotification/);
    assert.match(schema, /model AdminNotificationReceipt/);
    assert.match(schema, /scheduledPublishAt/);
  });
});

describe("phase 6E — Series / redirect / identity cross checks", () => {
  it("flags only truly broken Series items; external video fallback is healthy", () => {
    const ok = runSiteHealthChecks(siteContext());
    assert.equal(ok.issues.some((i) => i.id === "internal_link.series_recipe"), false);

    const broken = runSiteHealthChecks(
      siteContext({
        series: [
          {
            id: "bad",
            slug: "bad",
            title: "Bad",
            isPublished: true,
            items: [
              {
                id: "x",
                removedFromPlaylist: false,
                recipeId: "f",
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
  });

  it("documents cron cadence and hardening ownership", () => {
    const vercel = readFileSync(path.join(srcRoot, "..", "vercel.json"), "utf8");
    // Recipe publish is externally scheduled (Hobby); not registered on Vercel.
    assert.doesNotMatch(vercel, /\/api\/cron\/recipe-publish/);
    assert.doesNotMatch(vercel, /\*\/10 \* \* \* \*/);
    assert.match(read("app/api/cron/recipe-publish/route.ts"), /authorizeRecipePublishCronRequest/);
    assert.match(read("lib/cron-auth.ts"), /RECIPE_PUBLISH_CRON_SECRET/);
    assert.match(read("lib/phase6c-hardening.test.ts"), /claimScheduledRecipePublish/);
    assert.match(read("lib/phase6c-hardening.test.ts"), /AdminNotificationReceipt/);
  });
});
