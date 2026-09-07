import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeSearchAnalyticsQuery,
  sanitizeSearchAnalyticsFilters,
  clipSearchAnalyticsQueryRaw,
} from "./search-analytics.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("search analytics — helpers", () => {
  it("normalizes queries for aggregation", () => {
    assert.equal(normalizeSearchAnalyticsQuery("  Crispy   Rice "), "crispy rice");
    assert.equal(clipSearchAnalyticsQueryRaw("  Crispy   Rice "), "Crispy Rice");
  });

  it("sanitizes filters without PII keys", () => {
    assert.deepEqual(
      sanitizeSearchAnalyticsFilters({
        category: "breads",
        email: "x@y.com",
        query: "secret",
        video: true,
      }),
      { category: "breads", video: true },
    );
  });
});

describe("search analytics — architecture", () => {
  it("uses a dedicated SearchEvent model instead of FunnelEvent", () => {
    const schema = read("../../prisma/schema.prisma");
    assert.match(schema, /model SearchEvent \{/);
    assert.match(schema, /searchEvents SearchEvent\[\]/);
    const funnel = read("./funnel-analytics.ts");
    assert.doesNotMatch(funnel, /recipe_discovery_search|search_query/);
  });

  it("persists via consent-gated /api/analytics/search", () => {
    const route = read("../app/api/analytics/search/route.ts");
    assert.match(route, /isAnalyticsConsentGranted/);
    assert.match(route, /persistSearchEvent/);
    assert.match(route, /shouldSkipGuestAnalyticsIngest/);
  });

  it("captures catalog and overlay search commits", () => {
    const discovery = read("../components/RecipeDiscovery.tsx");
    const overlay = read("../components/SearchOverlay.tsx");
    assert.match(discovery, /emitRecipeSearchAnalytics/);
    assert.match(discovery, /applyDiscoveryFilters/);
    assert.match(overlay, /commitOverlaySearch|emitRecipeSearchAnalytics/);
    assert.match(overlay, /search_overlay/);
  });

  it("exposes Admin Search intelligence for content roles", () => {
    const nav = read("./admin-nav.ts");
    const page = read("../app/admin/(app)/search/page.tsx");
    assert.match(nav, /href: "\/admin\/search"/);
    assert.match(nav, /label: "Search"/);
    assert.match(page, /Popular searches/);
    assert.match(page, /Zero-result searches/);
    assert.match(page, /Filter dead ends/);
    assert.match(page, /requireAccess\("content"\)/);
  });

  it("documents search terms in the public privacy page", () => {
    const privacy = read("../app/privacy/page.tsx");
    assert.match(privacy, /consented\s+search terms/i);
  });
});
