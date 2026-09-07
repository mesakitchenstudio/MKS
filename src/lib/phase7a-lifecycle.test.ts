import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  aggregateSearchConsoleKpis,
  dailySearchConsoleTrend,
  formatSearchConsoleCtr,
  SEARCH_CONSOLE_INITIAL_SYNC_DAYS,
  SEARCH_CONSOLE_SYNC_OVERLAP_DAYS,
  topSearchConsolePages,
  topSearchConsoleQueries,
} from "./search-console/aggregate.ts";
import {
  classifySearchConsolePath,
  normalizeSearchConsolePageUrl,
} from "./search-console/paths.ts";
import { SEARCH_CONSOLE_SCOPES, searchConsoleScopesAreSufficient } from "./search-console/scopes.ts";
import { authorizeCronRequest } from "./cron-auth.ts";
import { canManageSearchConsole, canViewSearchConsole } from "./admin-access.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

describe("phase 7A — scopes and permissions", () => {
  it("uses least-privilege Search Console readonly scope", () => {
    assert.deepEqual([...SEARCH_CONSOLE_SCOPES], [
      "https://www.googleapis.com/auth/webmasters.readonly",
    ]);
    assert.equal(
      searchConsoleScopesAreSufficient(SEARCH_CONSOLE_SCOPES.join(" ")),
      true,
    );
    assert.equal(searchConsoleScopesAreSufficient("openid email"), false);
  });

  it("owners manage connection; content staff can view", () => {
    assert.equal(canManageSearchConsole("owner"), true);
    assert.equal(canManageSearchConsole("editor"), false);
    assert.equal(canViewSearchConsole("owner"), true);
    assert.equal(canViewSearchConsole("editor"), true);
    assert.equal(canViewSearchConsole("members"), false);
  });
});

describe("phase 7A — path / slug history policy", () => {
  it("preserves original URL and derives Mesa path without rewriting slug history", () => {
    const current = normalizeSearchConsolePageUrl(
      "https://mesakitchenstudio.com/recipes/new-slug",
    );
    assert.equal(current.normalizedPath, "/recipes/new-slug");
    assert.equal(current.pageUrl, "https://mesakitchenstudio.com/recipes/new-slug");

    const old = normalizeSearchConsolePageUrl(
      "https://www.mesakitchenstudio.com/recipes/old-slug?utm=1",
    );
    assert.equal(old.normalizedPath, "/recipes/old-slug");
    assert.match(old.pageUrl, /old-slug/);
    assert.equal(old.pageUrl.includes("utm"), true);

    const external = normalizeSearchConsolePageUrl("https://example.com/elsewhere");
    assert.equal(external.normalizedPath, "");
    assert.equal(external.isMesaHost, false);
  });

  it("classifies routes for display only", () => {
    assert.equal(classifySearchConsolePath("/recipes/x"), "recipe");
    assert.equal(classifySearchConsolePath("/series/y"), "collection");
    assert.equal(classifySearchConsolePath("/videos"), "video_hub");
    assert.equal(classifySearchConsolePath("/about"), "other");
  });
});

describe("phase 7A — aggregation math", () => {
  it("computes CTR from totals, not mean of row CTRs", () => {
    const rows = [
      { clicks: 1, impressions: 10, position: 5 },
      { clicks: 9, impressions: 90, position: 10 },
    ];
    const kpis = aggregateSearchConsoleKpis(rows);
    assert.equal(kpis.clicks, 10);
    assert.equal(kpis.impressions, 100);
    assert.equal(kpis.ctr, 0.1);
    // Naïve mean of 10% and 10% happens to match; unequal case:
    const unequal = aggregateSearchConsoleKpis([
      { clicks: 1, impressions: 10, position: 2 }, // 10%
      { clicks: 1, impressions: 100, position: 20 }, // 1%
    ]);
    assert.equal(unequal.ctr, 2 / 110);
    assert.notEqual(unequal.ctr, (0.1 + 0.01) / 2);
  });

  it("weights average position by impressions", () => {
    const kpis = aggregateSearchConsoleKpis([
      { clicks: 0, impressions: 10, position: 2 },
      { clicks: 0, impressions: 90, position: 12 },
    ]);
    assert.equal(kpis.position, (2 * 10 + 12 * 90) / 100);
  });

  it("builds ordered daily trend and top lists", () => {
    const trend = dailySearchConsoleTrend([
      { date: "2026-01-02", clicks: 2, impressions: 20, position: 4 },
      { date: "2026-01-01", clicks: 1, impressions: 10, position: 3 },
      { date: "2026-01-02", clicks: 3, impressions: 30, position: 5 },
    ]);
    assert.deepEqual(
      trend.map((d) => d.date),
      ["2026-01-01", "2026-01-02"],
    );
    assert.equal(trend[1]?.clicks, 5);

    const pages = topSearchConsolePages(
      [
        {
          date: "2026-01-01",
          pageUrl: "https://mesakitchenstudio.com/recipes/a",
          normalizedPath: "/recipes/a",
          clicks: 5,
          impressions: 50,
          ctr: 0.1,
          position: 3,
        },
        {
          date: "2026-01-02",
          pageUrl: "https://mesakitchenstudio.com/recipes/b",
          normalizedPath: "/recipes/b",
          clicks: 8,
          impressions: 40,
          ctr: 0.2,
          position: 2,
        },
      ],
      10,
    );
    assert.equal(pages[0]?.normalizedPath, "/recipes/b");

    const queries = topSearchConsoleQueries(
      [
        {
          date: "2026-01-01",
          query: "flatbread recipe",
          clicks: 3,
          impressions: 30,
          ctr: 0.1,
          position: 4,
        },
        {
          date: "2026-01-01",
          query: "easy salsa verde",
          clicks: 9,
          impressions: 90,
          ctr: 0.1,
          position: 2,
        },
      ],
      10,
    );
    assert.equal(queries[0]?.query, "easy salsa verde");
    assert.match(formatSearchConsoleCtr(0.1234), /%/);
  });

  it("documents sync window and overlap", () => {
    assert.equal(SEARCH_CONSOLE_INITIAL_SYNC_DAYS, 90);
    assert.equal(SEARCH_CONSOLE_SYNC_OVERLAP_DAYS, 3);
  });
});

describe("phase 7A — wiring / separation / security", () => {
  it("wires Admin route, OAuth, cron, and shared sync service", () => {
    const page = read("app/admin/(app)/search-console/page.tsx");
    assert.match(page, /requireAccess\("content"\)/);
    assert.match(page, /loadSearchConsoleDashboard/);
    assert.match(page, /Top Google searches/);
    assert.doesNotMatch(page, /SEO score|keyword density|Request indexing/i);

    const nav = read("lib/admin-nav.ts");
    assert.match(nav, /\/admin\/search-console/);

    const start = read("app/api/admin/search-console/oauth/start/route.ts");
    assert.match(start, /canManageSearchConsole/);
    assert.match(start, /SEARCH_CONSOLE_OAUTH_STATE_COOKIE/);

    const callback = read("app/api/admin/search-console/oauth/callback/route.ts");
    assert.match(callback, /hashSearchConsoleOAuthState/);
    assert.match(callback, /saveSearchConsoleConnection/);
    assert.doesNotMatch(callback, /NextResponse\.json\(/);
    assert.match(callback, /redirectToSearchConsole/);
    // Tokens are handed to saveSearchConsoleConnection server-side; never JSON-serialized to the client.
    assert.doesNotMatch(callback, /searchParams\.set\(["'](?:access_token|refresh_token)/);

    const cron = read("app/api/cron/search-console/route.ts");
    assert.match(cron, /authorizeCronRequest/);
    assert.match(cron, /syncSearchConsole/);
    assert.doesNotMatch(cron, /refreshTokenEnc|ADMIN_SECRET/);

    const vercel = readFileSync(path.join(srcRoot, "..", "vercel.json"), "utf8");
    assert.match(vercel, /\/api\/cron\/search-console/);
    assert.match(vercel, /0 8 \* \* \*/);
    assert.doesNotMatch(vercel, /\/api\/cron\/recipe-publish/);

    const sync = read("lib/search-console/sync.ts");
    assert.match(sync, /upsert/);
    assert.match(sync, /SEARCH_CONSOLE_SYNC_OVERLAP_DAYS/);
    assert.doesNotMatch(sync, /createAdminNotification/);
  });

  it("keeps Search Console separate from SearchEvent / Site Health / Content Health", () => {
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.match(schema, /model SearchConsoleConnection/);
    assert.match(schema, /model SearchConsolePageMetric/);
    assert.match(schema, /model SearchConsoleQueryMetric/);
    assert.match(schema, /model SearchEvent/);
    assert.doesNotMatch(schema, /model (ContentPerformanceScore|UnifiedContentMetric|SeoScore)/);

    const siteHealth = read("lib/site-health.ts");
    assert.doesNotMatch(siteHealth, /SearchConsolePageMetric|search-console\/sync/);

    const contentHealth = read("lib/recipe-content-health.ts");
    assert.doesNotMatch(contentHealth, /SearchConsole|search-console/);

    for (const file of [
      "app/recipes/[slug]/page.tsx",
      "app/recipes/page.tsx",
      "app/videos/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /search-console/);
    }
  });

  it("reuses Google OAuth client env without widening YouTube scopes", () => {
    const oauth = read("lib/search-console/oauth.ts");
    assert.match(oauth, /AUTH_GOOGLE_ID/);
    assert.match(oauth, /SEARCH_CONSOLE_SCOPES/);
    assert.doesNotMatch(oauth, /yt-analytics|youtube\.force-ssl/);

    const scopes = read("lib/search-console/scopes.ts");
    assert.match(scopes, /webmasters\.readonly/);

    const ytScopes = read("lib/youtube-analytics/oauth-scopes.ts");
    assert.doesNotMatch(ytScopes, /webmasters\.readonly/);
  });

  it("cron auth rejects missing/invalid secrets", () => {
    assert.equal(authorizeCronRequest(new Request("http://x"), {}).ok, false);
    assert.equal(
      authorizeCronRequest(new Request("http://x", { headers: { authorization: "Bearer bad" } }), {
        CRON_SECRET: "secret",
      }).ok,
      false,
    );
    assert.equal(
      authorizeCronRequest(
        new Request("http://x", { headers: { authorization: "Bearer secret" } }),
        { CRON_SECRET: "secret" },
      ).ok,
      true,
    );
  });

  it("disconnect retains historical metrics by clearing credentials only", () => {
    const connection = read("lib/search-console/connection.ts");
    assert.match(connection, /status:\s*"disconnected"/);
    assert.match(connection, /refreshTokenEnc:\s*""/);
    assert.doesNotMatch(connection, /searchConsolePageMetric\.deleteMany/);
    assert.doesNotMatch(connection, /searchConsoleQueryMetric\.deleteMany/);
  });
});
