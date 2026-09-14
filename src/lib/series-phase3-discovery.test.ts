import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { publicHeaderNavLabels, publicMobileNavLabels } from "./public-nav.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("Collections Phase 3 discovery", () => {
  it("adds Collections to desktop and mobile nav → /series", () => {
    assert.deepEqual(publicHeaderNavLabels(), ["Recipes", "Collections", "Videos", "About"]);
    assert.deepEqual(publicMobileNavLabels(), [
      "All recipes",
      "Collections",
      "Videos",
      "About",
      "Contact",
    ]);
    const nav = read("lib/public-nav.ts");
    assert.match(nav, /href: "\/series", label: "Collections"/);
  });

  it("adds Collections hub link to footer Site group", () => {
    const footer = read("components/SiteFooter.tsx");
    assert.match(footer, /href: "\/series", label: "Collections"/);
    const about = footer.indexOf('href: "/about"');
    const collections = footer.indexOf('href: "/series"');
    const videos = footer.indexOf('href: "/videos"');
    assert.ok(about > 0 && collections > about && videos > collections);
  });

  it("keeps one featured Collection and adds Explore all → /series", () => {
    const homepage = read("app/page.tsx");
    const featured = read("components/HomepageFeaturedSeries.tsx");
    assert.match(homepage, /featuredSeries = publishedSeries\[0\]/);
    assert.match(homepage, /HomepageFeaturedSeries/);
    assert.ok((homepage.match(/HomepageFeaturedSeries/g) || []).length >= 2);
    assert.doesNotMatch(homepage, /CollectionCard/);
    assert.match(featured, /Explore all collections/);
    assert.match(featured, /href="\/series"/);
    assert.match(featured, /homepage_collections_index/);
    assert.doesNotMatch(featured, /CollectionCard/);
  });

  it("keeps compact Recipe hero Collection links without a second shelf", () => {
    const hero = read("components/RecipePageHero.tsx");
    const context = read("components/series/RecipeSeriesContext.tsx");
    const detail = read("components/recipe/RecipeDetailView.tsx");
    const seriesLib = read("lib/series.ts");
    assert.match(hero, /RecipeSeriesContext/);
    assert.match(context, /Part of/);
    assert.match(context, /recipe_hero_collection/);
    assert.doesNotMatch(detail, /RecipeSeriesLinks/);
    assert.doesNotMatch(detail, /Explore collections/);
    assert.match(seriesLib, /selectRecipeCollectionMemberships/);
    assert.match(seriesLib, /Slim Recipe → Collection membership/);
    assert.doesNotMatch(
      seriesLib.slice(seriesLib.indexOf("export async function getSeriesLinksForRecipe")),
      /include:\s*\{\s*series:\s*\{\s*include:\s*\{\s*items:/,
    );
  });

  it("removes unused RecipeSeriesLinks second-shelf component", () => {
    assert.throws(() => read("components/series/RecipeSeriesLinks.tsx"));
  });

  it("places Category Collection shelf after the recipe grid", () => {
    const page = read("app/category/[slug]/page.tsx");
    assert.match(page, /listPublishedSeriesCardsForCategory/);
    assert.match(page, /Explore collections/);
    assert.match(page, /CollectionCard/);
    const gridIdx = page.indexOf("RecipeGridCard");
    const shelfIdx = page.indexOf("category-collections-heading");
    assert.ok(gridIdx > 0 && shelfIdx > gridIdx);
    assert.match(page, /Recipes for this category are coming soon/);
  });

  it("keeps /recipes and SearchOverlay recipes-only", () => {
    const overlay = read("components/SearchOverlay.tsx");
    const recipesPage = read("app/recipes/page.tsx");
    assert.doesNotMatch(overlay, /\/series|CollectionCard|Collections/);
    assert.doesNotMatch(recipesPage, /listPublishedSeries|CollectionCard/);
  });

  it("documents discovery and intentional search deferral", () => {
    const series = read("lib/admin-documentation/topics/series.ts");
    const editor = read("lib/admin-documentation/topics/series-editor.ts");
    const categories = read("lib/admin-documentation/topics/categories.ts");
    assert.match(series, /id: "discovery"/);
    assert.match(series, /Public search and the \/recipes catalogue stay recipes-only/);
    assert.match(editor, /Recipe heroes and relevant Category pages/);
    assert.match(categories, /appear automatically after the Category/);
  });

  it("does not introduce /collections aliases or schema Featured flags", () => {
    const series = read("lib/series.ts");
    assert.doesNotMatch(series, /isFeatured/);
    assert.doesNotMatch(read("app/category/[slug]/page.tsx"), /\/collections/);
    assert.doesNotMatch(read("lib/public-nav.ts"), /\/collections/);
  });
});
