import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canAccess, canManageYoutubeAnalytics, canManageYoutubeSync } from "./admin-access";
import { adminWorkspaceWide } from "./admin-ui";
import { adminWorkspaceWidthForPath } from "./admin-nav";
import {
  compactLowSampleNotice,
  FUNNEL_METHODOLOGY,
  quietZeroVisitorOutcomeLabel,
} from "./youtube-funnel/funnel-display";

const root = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(root, "../app/admin/(app)/youtube/page.tsx"), "utf8");
const dashboard = readFileSync(
  path.join(root, "../components/admin/YoutubeDashboard.tsx"),
  "utf8",
);
const funnel = readFileSync(
  path.join(root, "../components/admin/YoutubeFunnelPanel.tsx"),
  "utf8",
);

describe("YouTube admin UI redesign contracts", () => {
  it("keeps wide workspace and view=funnel URL contract", () => {
    assert.equal(adminWorkspaceWide, "max-w-[77.5rem]");
    assert.equal(adminWorkspaceWidthForPath("/admin/youtube"), adminWorkspaceWide);
    assert.match(page, /parseYoutubeView/);
    assert.match(page, /view === "funnel"/);
    assert.match(page, /qs\.set\("view", "funnel"\)/);
    assert.match(page, /Website video/);
    assert.match(page, />\s*Channel\s*</);
    assert.doesNotMatch(page, /Website funnel/);
    assert.doesNotMatch(page, /Channel analytics/);
  });

  it("uses one shared H1 YouTube and aria-current on view links", () => {
    assert.match(page, /<h1[\s\S]*>\s*YouTube\s*</);
    assert.match(page, /aria-current=\{view === "channel" \? "page" : undefined\}/);
    assert.match(page, /aria-current=\{view === "funnel" \? "page" : undefined\}/);
    assert.doesNotMatch(dashboard, /<h1[\s\S]*>YouTube</);
    assert.doesNotMatch(funnel, /<h1[\s\S]*>/);
    assert.doesNotMatch(funnel, /Website funnel/);
  });

  it("Channel hierarchy uses list attention, metric strips, coverage before public", () => {
    assert.match(dashboard, /Performance, coverage, and what to publish next/);
    assert.match(dashboard, /Data status/);
    assert.match(dashboard, /max-w-\[30rem\]/);
    assert.doesNotMatch(dashboard, /absolute left-0 z-20/);
    assert.match(dashboard, /Needs attention/);
    assert.match(dashboard, /reviewAllOpen/);
    assert.doesNotMatch(dashboard, /max-h-\[min\(28rem/);
    assert.doesNotMatch(dashboard, /overflow-y-auto overscroll-contain/);
    assert.match(dashboard, /Period performance/);
    assert.match(dashboard, /sm:grid-cols-3/);
    assert.match(dashboard, /subscribersGained\} gained · \{analytics\.channel\.subscribersLost\} lost/);
    assert.match(dashboard, /Estimated/);
    assert.match(dashboard, /Videos with a Mesa recipe/);
    assert.match(dashboard, /Published recipes with a video/);
    assert.match(dashboard, /Public channel/);
    assert.match(dashboard, /Subs gained · \{periodSuffix\}/);
    assert.match(dashboard, /Search titles/);
    assert.match(dashboard, /sm:w-\[20rem\]/);
    assert.match(dashboard, />Sort</);
    assert.match(dashboard, /<select/);
    assert.match(dashboard, /sm:flex-row sm:items-start sm:justify-between/);
    const coverage = dashboard.indexOf("CatalogCoverageSection");
    const publicSnap = dashboard.indexOf("<ChannelSnapshot");
    assert.ok(coverage >= 0 && publicSnap > coverage);
  });

  it("preserves Opportunities vs Needs recipe as separate filters", () => {
    assert.match(dashboard, /Opportunities/);
    assert.match(dashboard, /Needs recipe/);
    assert.match(dashboard, /aria-label="Format"/);
    assert.match(dashboard, /aria-label="Work"/);
    assert.match(dashboard, />Format</);
    assert.match(dashboard, />Work</);
  });

  it("Website video panel uses independent outcomes and quiet zeros", () => {
    assert.equal(
      FUNNEL_METHODOLOGY.intro,
      "First-party actions on recipe pages with a video. Not YouTube views or subscriptions.",
    );
    assert.match(funnel, /Independent outcomes/);
    assert.match(funnel, /Methodology/);
    assert.match(funnel, /quietZeroVisitorOutcomeLabel/);
    assert.match(funnel, /compactLowSampleNotice/);
    assert.match(funnel, /formatContinuedViewingOutcome/);
    assert.match(funnel, /continued\.fractionLabel|continuedPrimary/);
    const recipes = funnel.indexOf("Recipe performance");
    const cta = funnel.indexOf("CTA placement");
    assert.ok(recipes >= 0 && cta > recipes);
    assert.equal(quietZeroVisitorOutcomeLabel("0 of 0 visitors"), "—");
    assert.equal(quietZeroVisitorOutcomeLabel("0 of 4 visitors"), "0 of 4 visitors");
    assert.match(compactLowSampleNotice(4), /Limited sample · 4 unique visitors/);
  });

  it("preserves YouTube access matrix", () => {
    assert.equal(canAccess("owner", "youtube"), true);
    assert.equal(canAccess("editor", "youtube"), true);
    assert.equal(canAccess("members", "youtube"), false);
    assert.equal(canManageYoutubeAnalytics("owner"), true);
    assert.equal(canManageYoutubeAnalytics("editor"), false);
    assert.equal(canManageYoutubeSync("owner"), true);
    assert.equal(canManageYoutubeSync("editor"), false);
  });
});
