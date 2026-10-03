/**
 * Roadmap #13 Phase 13D — Admin Growth Opportunities dashboard / gate / UI.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GrowthOpportunitiesView } from "@/components/admin/GrowthOpportunitiesView";
import { buildAdminNavSections, flattenAdminNavItemLabels } from "@/lib/admin-nav";
import { isAdminGrowthOpportunitiesEnabled } from "@/lib/flags";
import type { GrowthOpportunity } from "@/lib/growth-opportunities";
import {
  filterGrowthOpportunities,
  growthOpportunityPriorityLabel,
  growthOpportunityTypeLabel,
  isSafeAdminGrowthHref,
  summarizeGrowthPriorities,
} from "@/lib/growth-opportunities-ui";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

function opportunity(
  partial: Partial<GrowthOpportunity> &
    Pick<GrowthOpportunity, "id" | "ruleId" | "type" | "priority" | "title">,
): GrowthOpportunity {
  return {
    evidence: ["Evidence line"],
    priorityReason: "Priority reason",
    actionLabel: "Open",
    href: "/admin/recipes/r1",
    entityType: "recipe",
    entityId: "r1",
    ...partial,
  };
}

const fixtures: GrowthOpportunity[] = [
  opportunity({
    id: "search_zero_repeat:search_query:air",
    ruleId: "search_zero_repeat",
    type: "search_demand",
    priority: "high",
    title: "Create coverage for 'air fryer <chicken>'",
    evidence: [
      "'air fryer <chicken> & \"wings\"' returned zero Recipes 5 times in the last 28 days.",
    ],
    priorityReason: "Repeated zero-result demand.",
    actionLabel: "Review search coverage",
    href: "/admin/search",
    entityType: "search_query",
    entityId: "air fryer chicken",
  }),
  opportunity({
    id: "category_below_indexable:category:breads",
    ruleId: "category_below_indexable",
    type: "seo_coverage",
    priority: "medium",
    title: "Improve Breads coverage",
    evidence: ["Breads has 2 Published Recipes."],
    priorityReason: "Below indexability.",
    actionLabel: "Open category",
    href: "/admin/categories",
    entityType: "category",
    entityId: "breads",
  }),
  opportunity({
    id: "recipe_missing_youtube:recipe:r-video",
    ruleId: "recipe_missing_youtube",
    type: "video",
    priority: "high",
    title: "Add YouTube to Cake",
    evidence: ["Published Recipe has no usable YouTube video."],
    priorityReason: "Missing video.",
    actionLabel: "Open Recipe",
    href: "/admin/recipes/r-video",
    entityType: "recipe",
    entityId: "r-video",
  }),
  opportunity({
    id: "category_empty_indexable_description:category:holiday",
    ruleId: "category_empty_indexable_description",
    type: "seo_coverage",
    priority: "low",
    title: "Add description for Holiday",
    evidence: ["Indexable category missing description."],
    priorityReason: "Editorial polish.",
    actionLabel: "Open category",
    href: "/admin/categories",
    entityType: "category",
    entityId: "holiday",
  }),
  opportunity({
    id: "published_readiness_recommendations:recipe:r-ready",
    ruleId: "published_readiness_recommendations",
    type: "content_quality",
    priority: "medium",
    title: "Recommended improvements on Toast",
    evidence: ["SEO description is missing.", "Hero image is missing."],
    priorityReason: "Recommended improvements remain.",
    actionLabel: "Review recommendations",
    href: "/admin/recipes/r-ready",
    entityType: "recipe",
    entityId: "r-ready",
  }),
];

describe("growth opportunities admin — feature gate exactness", () => {
  it("enables only exact lowercase true", () => {
    const key = "ADMIN_GROWTH_OPPORTUNITIES_ENABLED";
    const prev = process.env[key];
    try {
      delete process.env[key];
      assert.equal(isAdminGrowthOpportunitiesEnabled(), false);
      process.env[key] = "";
      assert.equal(isAdminGrowthOpportunitiesEnabled(), false);
      process.env[key] = "TRUE";
      assert.equal(isAdminGrowthOpportunitiesEnabled(), false);
      process.env[key] = "1";
      assert.equal(isAdminGrowthOpportunitiesEnabled(), false);
      process.env[key] = "yes";
      assert.equal(isAdminGrowthOpportunitiesEnabled(), false);
      process.env[key] = "true";
      assert.equal(isAdminGrowthOpportunitiesEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  });
});

describe("growth opportunities admin — nav / route contracts", () => {
  it("gates Growth Opportunities nav after Content Performance", () => {
    const off = flattenAdminNavItemLabels(buildAdminNavSections("owner"));
    assert.equal(off.includes("Growth Opportunities"), false);

    const ownerOn = flattenAdminNavItemLabels(
      buildAdminNavSections("owner", { growthOpportunitiesEnabled: true }),
    );
    assert.equal(ownerOn.includes("Growth Opportunities"), true);
    const analytics = buildAdminNavSections("owner", {
      growthOpportunitiesEnabled: true,
    }).find((section) => section.id === "analytics");
    const hrefs = analytics?.items.map((item) => item.href) ?? [];
    assert.ok(hrefs.indexOf("/admin/growth") === hrefs.indexOf("/admin/content-performance") + 1);

    const editorOn = flattenAdminNavItemLabels(
      buildAdminNavSections("editor", { growthOpportunitiesEnabled: true }),
    );
    assert.equal(editorOn.includes("Growth Opportunities"), true);

    const audienceOn = flattenAdminNavItemLabels(
      buildAdminNavSections("members", { growthOpportunitiesEnabled: true }),
    );
    assert.equal(audienceOn.includes("Growth Opportunities"), false);

    const layout = readRepo("app/admin/(app)/layout.tsx");
    assert.match(layout, /isAdminGrowthOpportunitiesEnabled\(\)/);
    assert.match(layout, /growthOpportunitiesEnabled:\s*isAdminGrowthOpportunitiesEnabled\(\)/);
  });

  it("route gates before loader and stays server-only", () => {
    const page = readRepo("app/admin/(app)/growth/page.tsx");
    assert.match(page, /isAdminGrowthOpportunitiesEnabled\(\)/);
    assert.match(page, /notFound\(\)/);
    assert.match(page, /getAdminGrowthOpportunities\(\)/);
    assert.match(page, /force-dynamic/);
    assert.match(page, /Growth Opportunities/);
    assert.match(page, /Evidence-based opportunities/);
    assert.match(page, /Read-only/);
    assert.doesNotMatch(page, /"use client"/);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(page, /NEXT_PUBLIC_/);
    assert.doesNotMatch(page, /createAdminAudit|AdminAudit|searchEvent\.create/);

    const gateIndex = page.indexOf("isAdminGrowthOpportunitiesEnabled()");
    const notFoundIndex = page.indexOf("notFound()");
    const loaderIndex = page.indexOf("getAdminGrowthOpportunities()");
    assert.ok(gateIndex >= 0 && notFoundIndex > gateIndex);
    assert.ok(loaderIndex > notFoundIndex);

    const view = readRepo("components/admin/GrowthOpportunitiesView.tsx");
    assert.match(view, /"use client"/);
    assert.doesNotMatch(view, /growth-opportunities-server/);
    assert.doesNotMatch(view, /getDb|@prisma\/client|prisma/);
    assert.doesNotMatch(view, /dangerouslySetInnerHTML/);
    assert.match(view, /No opportunities match these filters/);
    assert.match(view, /Nothing urgent found under current rules/);
    assert.match(view, /Clear filters/);
    assert.match(view, /Recommended improvement|Why this priority/);

    const flags = readRepo("lib/flags.ts");
    assert.match(flags, /ADMIN_GROWTH_OPPORTUNITIES_ENABLED === "true"/);
    assert.doesNotMatch(flags, /NEXT_PUBLIC_ADMIN_GROWTH/);
  });

  it("destination href helpers resolve to existing Admin routes", () => {
    const engine = readRepo("lib/growth-opportunities.ts");
    assert.match(engine, /\/admin\/recipes\/\$\{encodeURIComponent\(id\)\}/);
    assert.match(engine, /return "\/admin\/categories"/);
    assert.match(engine, /return "\/admin\/ingredients"/);
    assert.match(engine, /\/admin\/series\/\$\{encodeURIComponent\(id\)\}/);
    assert.match(engine, /return "\/admin\/search"/);

    for (const href of [
      "/admin/recipes/abc",
      "/admin/categories",
      "/admin/ingredients",
      "/admin/series/s1",
      "/admin/search",
    ]) {
      assert.equal(isSafeAdminGrowthHref(href), true);
    }
    assert.equal(isSafeAdminGrowthHref("https://evil.example/admin/x"), false);
    assert.equal(isSafeAdminGrowthHref("//evil.example"), false);
    assert.equal(isSafeAdminGrowthHref("/public"), false);
    assert.equal(isSafeAdminGrowthHref("/admin"), false);
  });
});

describe("growth opportunities admin — presentation helpers", () => {
  it("summarizes priorities and preserves filter order", () => {
    const summary = summarizeGrowthPriorities(fixtures);
    assert.deepEqual(summary, { total: 5, high: 2, medium: 2, low: 1 });

    const video = filterGrowthOpportunities(fixtures, { type: "video" });
    assert.deepEqual(
      video.map((row) => row.id),
      ["recipe_missing_youtube:recipe:r-video"],
    );

    const high = filterGrowthOpportunities(fixtures, { priority: "high" });
    assert.deepEqual(
      high.map((row) => row.id),
      [
        "search_zero_repeat:search_query:air",
        "recipe_missing_youtube:recipe:r-video",
      ],
    );

    const combined = filterGrowthOpportunities(fixtures, {
      type: "video",
      priority: "high",
    });
    assert.equal(combined.length, 1);
    assert.equal(combined[0]!.id, "recipe_missing_youtube:recipe:r-video");

    const empty = filterGrowthOpportunities(fixtures, {
      type: "series_depth",
      priority: "high",
    });
    assert.equal(empty.length, 0);

    assert.equal(growthOpportunityTypeLabel("seo_coverage"), "SEO / Coverage");
    assert.equal(growthOpportunityPriorityLabel("high"), "High");
  });
});

describe("growth opportunities admin — render contracts", () => {
  it("renders summary, labels, evidence, actions, and escapes HTML", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthOpportunitiesView, {
        opportunities: fixtures,
        generatedLabel: "Jun 15, 2026 · 3:00 PM TRT",
      }),
    );

    assert.match(html, /Opportunity summary/);
    assert.match(html, />5</);
    assert.match(html, /High/);
    assert.match(html, /Medium/);
    assert.match(html, /Low/);
    assert.match(html, /Search Demand/);
    assert.match(html, /SEO \/ Coverage/);
    assert.match(html, /Video/);
    assert.match(html, /Content Quality/);
    assert.match(html, /Create coverage for &#x27;air fryer &lt;chicken&gt;&#x27;/);
    assert.match(
      html,
      /&#x27;air fryer &lt;chicken&gt; &amp; &quot;wings&quot;&#x27; returned zero Recipes/,
    );
    assert.match(html, /Why this priority:/);
    assert.match(html, /Review search coverage/);
    assert.match(html, /href="\/admin\/search"/);
    assert.match(html, /href="\/admin\/categories"/);
    assert.match(html, /href="\/admin\/recipes\/r-video"/);
    // Machine rule ids may exist only as data attributes — not editor-facing labels.
    assert.match(html, /data-rule-id="search_zero_repeat"/);
    assert.doesNotMatch(html, />search_zero_repeat</);
    assert.doesNotMatch(html, /visitorId|subscriberId|userId/i);
    assert.doesNotMatch(html, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(html, /Growth score|AI-powered|guaranteed growth/i);
  });

  it("suppresses unsafe action hrefs", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthOpportunitiesView, {
        opportunities: [
          opportunity({
            id: "bad",
            ruleId: "recipe_missing_youtube",
            type: "video",
            priority: "high",
            title: "Bad link",
            href: "https://evil.example/phish",
            actionLabel: "Open Recipe",
          }),
        ],
      }),
    );
    assert.doesNotMatch(html, /href="https:\/\/evil/);
    assert.match(html, /Open Recipe/);
  });

  it("shows global empty state without optimization claims", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthOpportunitiesView, { opportunities: [] }),
    );
    assert.match(html, /Nothing urgent found under current rules/);
    assert.match(html, /deterministic signals/);
    assert.doesNotMatch(html, /fully optimized|perfect score|No growth work remains/i);
    assert.match(html, />0</);
  });

  it("preserves source order in default render", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthOpportunitiesView, { opportunities: fixtures }),
    );
    const first = html.indexOf("Create coverage for");
    const second = html.indexOf("Improve Breads coverage");
    const third = html.indexOf("Add YouTube to Cake");
    assert.ok(first >= 0 && second > first && third > second);
  });
});
