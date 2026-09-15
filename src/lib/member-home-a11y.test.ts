/**
 * Phase 7F — accessibility / responsive contracts for Personalized Member Home.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromRepo: string) {
  return readFileSync(path.join(root, "..", "..", relFromRepo), "utf8");
}

describe("Phase 7F — heading and landmark contracts", () => {
  it("uses one page h1 and unique section h2 ids on gate-ON Profile", () => {
    const page = readRepo("src/app/profile/page.tsx");
    assert.match(page, /<h1 className="break-words font-serif/);
    assert.match(page, /memberHomeWelcomeHeading/);
    // Enhanced sections use unique labelled ids
    const sections = [
      "member-home-this-week",
      "member-home-recently-viewed",
      "member-home-recommended",
      "member-home-saved",
      "member-home-collections",
      "member-home-discover",
      "member-home-get-started",
    ];
    for (const id of sections) {
      assert.match(readRepo("src/components/member-home/MemberHomeThisWeek.tsx") +
        readRepo("src/components/member-home/MemberHomeRecentlyViewed.tsx") +
        readRepo("src/components/member-home/MemberHomeSections.tsx") +
        page, new RegExp(`id="${id}"`));
    }
  });

  it("associates recommendation reasons with card links", () => {
    const card = readRepo("src/components/member-home/RecommendationRecipeCard.tsx");
    const grid = readRepo("src/components/RecipeGridCard.tsx");
    assert.match(card, /member-home-rec-reason-\$\{recipe\.slug\}/);
    assert.match(card, /ariaDescribedBy=\{reasonId\}/);
    assert.match(card, /break-words/);
    assert.match(grid, /aria-describedby/);
    assert.match(grid, /ariaDescribedBy/);
  });

  it("keeps Clear before cards and focus-visible styles", () => {
    const recent = readRepo("src/components/member-home/MemberHomeRecentlyViewed.tsx");
    assert.match(recent, /aria-label="Clear recently viewed"/);
    assert.match(recent, /focus-visible:outline-terracotta/);
    const clearIdx = recent.indexOf("Clear recently viewed");
    const listIdx = recent.indexOf("<ul");
    assert.ok(clearIdx > 0 && listIdx > clearIdx);
  });

  it("This week loading uses compact aria-busy without permanent skeleton after failure", () => {
    const week = readRepo("src/components/member-home/MemberHomeThisWeek.tsx");
    assert.match(week, /aria-busy="true"/);
    assert.match(week, /status === "unavailable"/);
    assert.match(week, /status === "loading"/);
    assert.doesNotMatch(week, /prefers-reduced-motion|animate-spin|carousel/);
  });

  it("responsive grids use min-w-0 and break-words for long content", () => {
    const sections = readRepo("src/components/member-home/MemberHomeSections.tsx");
    const recent = readRepo("src/components/member-home/MemberHomeRecentlyViewed.tsx");
    const rec = readRepo("src/components/member-home/RecommendationRecipeCard.tsx");
    assert.match(sections, /break-words/);
    assert.match(sections, /min-w-0/);
    assert.match(recent, /min-w-0/);
    assert.match(rec, /min-w-0/);
    assert.match(sections, /sm:grid-cols-2 lg:grid-cols-4|sm:grid-cols-2 lg:grid-cols-3/);
  });

  it("does not CSS-reorder Member Home sections", () => {
    const page = readRepo("src/app/profile/page.tsx");
    const sections = readRepo("src/components/member-home/MemberHomeSections.tsx");
    assert.doesNotMatch(page, /order-\d/);
    assert.doesNotMatch(sections, /order-\d/);
  });

  it("gate OFF baseline remains free of enhanced a11y ids", () => {
    const page = readRepo("src/app/profile/page.tsx");
    const baseline = page.slice(page.indexOf("function BaselineProfile"));
    assert.doesNotMatch(baseline, /member-home-recommended|MemberHomeRecentlyViewed/);
  });
});
