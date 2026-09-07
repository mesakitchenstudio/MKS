import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RECENTLY_VIEWED_MAX_AGE_DAYS,
  RECENTLY_VIEWED_MAX_STORED,
  RECENTLY_VIEWED_MIN_DISPLAY,
  RECENTLY_VIEWED_STORAGE_KEY,
  filterFreshRecentlyViewed,
  isRecentlyViewedExpired,
  mergeRecentlyViewedEntry,
  normalizeRecentlyViewedEntry,
  parseRecentlyViewedList,
  resolveRecentlyViewedRecipes,
} from "./recently-viewed.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

function entry(
  overrides: Partial<{
    id: string;
    slug: string;
    title: string;
    image: string;
    imageAlt: string;
    viewedAt: string;
  }> = {},
) {
  return {
    id: "r1",
    slug: "baguettes",
    title: "Baguettes",
    image: "/b.jpg",
    imageAlt: "Bread",
    viewedAt: "2026-09-07T12:00:00.000Z",
    ...overrides,
  };
}

describe("recently viewed — data", () => {
  it("normalizes valid entries and rejects incomplete ones", () => {
    assert.deepEqual(normalizeRecentlyViewedEntry(entry()), entry());
    assert.equal(normalizeRecentlyViewedEntry({ slug: "x", title: "Y" }), null);
    assert.equal(normalizeRecentlyViewedEntry(null), null);
  });

  it("fails safely on malformed JSON and non-arrays", () => {
    assert.deepEqual(parseRecentlyViewedList("{nope"), []);
    assert.deepEqual(parseRecentlyViewedList('"string"'), []);
    assert.deepEqual(parseRecentlyViewedList("{}"), []);
    assert.deepEqual(
      parseRecentlyViewedList(JSON.stringify([{ id: "only" }, entry(), null])),
      [entry()],
    );
  });

  it("parses lists with dedupe and max length", () => {
    const many = Array.from({ length: RECENTLY_VIEWED_MAX_STORED + 5 }, (_, i) =>
      entry({
        id: `id-${i}`,
        slug: `slug-${i}`,
        title: `Title ${i}`,
        image: `/i-${i}.jpg`,
        imageAlt: `Alt ${i}`,
      }),
    );
    const parsed = parseRecentlyViewedList(JSON.stringify(many));
    assert.equal(parsed.length, RECENTLY_VIEWED_MAX_STORED);
    assert.equal(parsed[0]?.id, "id-0");

    const duped = parseRecentlyViewedList(
      JSON.stringify([many[0], { ...many[0], title: "Other" }, many[1]]),
    );
    assert.equal(duped.length, 2);
    assert.equal(duped[0]?.title, "Title 0");
  });

  it("moves revisited recipes to the front without duplicating", () => {
    const a = entry({ id: "a", slug: "a", title: "A", image: "/a.jpg" });
    const b = entry({ id: "b", slug: "b", title: "B", image: "/b.jpg" });
    const c = entry({ id: "c", slug: "c", title: "C", image: "/c.jpg" });
    const first = mergeRecentlyViewedEntry([], a);
    const second = mergeRecentlyViewedEntry(first, b);
    const third = mergeRecentlyViewedEntry(second, c);
    assert.deepEqual(
      third.map((item) => item.id),
      ["c", "b", "a"],
    );

    const revisited = mergeRecentlyViewedEntry(third, {
      ...b,
      viewedAt: "2026-09-08T12:00:00.000Z",
    });
    assert.deepEqual(
      revisited.map((item) => item.id),
      ["b", "c", "a"],
    );

    const again = mergeRecentlyViewedEntry(revisited, {
      ...b,
      viewedAt: "2026-09-08T13:00:00.000Z",
    });
    assert.deepEqual(
      again.map((item) => item.id),
      ["b", "c", "a"],
    );
  });

  it("expires entries older than the TTL during parse", () => {
    const now = Date.parse("2026-09-07T12:00:00.000Z");
    const fresh = entry({
      id: "fresh",
      viewedAt: "2026-08-01T12:00:00.000Z",
    });
    const stale = entry({
      id: "stale",
      slug: "stale",
      title: "Stale",
      image: "/s.jpg",
      viewedAt: "2026-01-01T12:00:00.000Z",
    });
    assert.equal(isRecentlyViewedExpired(stale, now), true);
    assert.equal(isRecentlyViewedExpired(fresh, now), false);
    assert.equal(RECENTLY_VIEWED_MAX_AGE_DAYS, 90);
    assert.deepEqual(
      parseRecentlyViewedList(JSON.stringify([fresh, stale]), now).map((item) => item.id),
      ["fresh"],
    );
    assert.deepEqual(filterFreshRecentlyViewed([fresh, stale], now).map((item) => item.id), [
      "fresh",
    ]);
  });

  it("resolves against live catalogue by id then slug and drops missing", () => {
    const recent = [
      entry({
        id: "keep-id",
        slug: "old-slug",
        title: "Old Title",
        image: "/old.jpg",
        imageAlt: "Old",
      }),
      entry({
        id: "gone",
        slug: "deleted",
        title: "Gone",
        image: "/g.jpg",
        imageAlt: "Gone",
        viewedAt: "2026-09-07T11:00:00.000Z",
      }),
      entry({
        id: "slug-only",
        slug: "salsa-verde",
        title: "Salsa",
        image: "/s.jpg",
        imageAlt: "Salsa",
        viewedAt: "2026-09-07T10:00:00.000Z",
      }),
    ];
    const catalogue = [
      {
        id: "keep-id",
        slug: "classic-french-baguettes",
        title: "Classic French Baguettes",
        image: "/b.jpg",
        imageAlt: "Baguettes",
      },
      {
        slug: "salsa-verde",
        title: "Salsa Verde",
        image: "/live-s.jpg",
        imageAlt: "Live salsa",
      },
    ];
    const resolved = resolveRecentlyViewedRecipes(recent, catalogue, { limit: 4 });
    assert.deepEqual(
      resolved.map((recipe) => recipe.slug),
      ["classic-french-baguettes", "salsa-verde"],
    );
    assert.equal(resolved[0]?.title, "Classic French Baguettes");
  });
});

describe("recently viewed — architecture", () => {
  it("records from recipe detail SetCurrentRecipe using local storage only", () => {
    const float = read("components/RecipeFloatTools.tsx");
    const page = read("app/recipes/[slug]/page.tsx");
    assert.match(float, /recordRecentlyViewed/);
    assert.match(page, /publicRecipeId\(recipe\)/);
    assert.match(page, /image=\{recipe\.image\}/);
    assert.doesNotMatch(page, /\/cook/);
    const cook = read("app/recipes/[slug]/cook/page.tsx");
    assert.doesNotMatch(cook, /recordRecentlyViewed|SetCurrentRecipe/);
  });

  it("shows homepage shelf with Clear after Latest without analytics consent", () => {
    const home = read("app/page.tsx");
    const section = read("components/HomepageRecentlyViewed.tsx");
    assert.match(home, /HomepageRecentlyViewed/);
    const body = home.slice(home.indexOf("return ("));
    const latestIdx = body.indexOf("<HomepageLatestSection");
    const recentIdx = body.indexOf("<HomepageRecentlyViewed");
    const seriesIdx = body.indexOf("<HomepageFeaturedSeries");
    assert.ok(latestIdx >= 0 && recentIdx > latestIdx);
    assert.ok(seriesIdx > recentIdx);
    assert.match(section, /Recently viewed/);
    assert.match(section, /clearRecentlyViewed/);
    assert.match(section, />\s*Clear\s*</);
    assert.match(section, /RECENTLY_VIEWED_MIN_DISPLAY/);
    assert.match(section, /useSyncExternalStore/);
    assert.doesNotMatch(section, /isAnalyticsConsentGranted|trackEvent|fetch\(/);
    assert.doesNotMatch(section, /confirm\(|window\.confirm/);
  });

  it("uses versioned localStorage key and is not cleared with guest analytics", () => {
    assert.equal(RECENTLY_VIEWED_STORAGE_KEY, "mesa:recently-viewed:v1");
    assert.ok(RECENTLY_VIEWED_MIN_DISPLAY >= 2);
    const guest = read("lib/guest-tracking.ts");
    assert.doesNotMatch(guest, /recently-viewed|RECENTLY_VIEWED/);
    const helper = read("lib/recently-viewed.ts");
    assert.doesNotMatch(helper, /getDb|prisma|fetch\(/);
    assert.match(helper, /storage/);
  });

  it("exposes recently viewed in SearchOverlay only when query is empty", () => {
    const overlay = read("components/SearchOverlay.tsx");
    assert.match(overlay, /Recently viewed/);
    assert.match(overlay, /resolveRecentlyViewedRecipes/);
    assert.match(overlay, /!query\.trim\(\) && recentRecipes\.length >= RECENTLY_VIEWED_MIN_DISPLAY/);
    assert.match(overlay, /if \(query\.trim\(\)\) return \[\]/);
    assert.doesNotMatch(overlay, /rankOverlayRecipes\([^\)]*recent/);
    const layout = read("app/layout.tsx");
    assert.match(layout, /id: publicRecipeId\(recipe\)/);
  });

  it("clear history stays isolated from favorites and cooking sessions", () => {
    const helper = read("lib/recently-viewed.ts");
    assert.match(helper, /export function clearRecentlyViewed/);
    assert.doesNotMatch(helper, /mesa-liked|cooking-session|writeLikes|clearCookingSession/);
    const section = read("components/HomepageRecentlyViewed.tsx");
    assert.match(section, /clearRecentlyViewed\(\)/);
    assert.doesNotMatch(section, /writeLikes|clearCookingSession|localStorage\.clear/);
  });

  it("does not place Recently Viewed on /recipes catalogue", () => {
    const recipesPage = read("app/recipes/page.tsx");
    assert.doesNotMatch(recipesPage, /HomepageRecentlyViewed|recently-viewed|Recently viewed/);
  });
});
