import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categories } from "../data/categories.ts";
import { homepageCollectionSlugMap } from "../data/homepage.ts";
import { recipes } from "../data/recipes.ts";
import {
  applyDiscoveryFilters,
  browsableCategoriesWithCounts,
  buildRecipesUrl,
  parseDiscoveryParams,
  PRIMARY_BROWSE_GROUPS,
  sortRecipeList,
} from "./recipe-discovery.ts";

describe("recipe discovery", () => {
  const collectionMap = homepageCollectionSlugMap();

  it("parses query parameters", () => {
    const params = parseDiscoveryParams({
      q: " lemon ",
      category: "desserts",
      collection: "cookies-and-sweets",
      sort: "alpha",
    });
    assert.equal(params.q, "lemon");
    assert.equal(params.category, "desserts");
    assert.equal(params.collection, "cookies-and-sweets");
    assert.equal(params.sort, "alpha");
  });

  it("filters by collection slug order", () => {
    const result = applyDiscoveryFilters(
      recipes,
      { collection: "cookies-and-sweets" },
      collectionMap,
    );
    assert.equal(result.length, 4);
    assert.equal(result[0]?.slug, "chocolate-chunk-cookies");
  });

  it("filters desserts across dessert categories", () => {
    const result = applyDiscoveryFilters(recipes, { category: "desserts" }, collectionMap);
    assert.ok(
      result.every((recipe) =>
        recipe.categories.some((slug) =>
          ["desserts", "cookies", "cakes", "brownies-bars"].includes(slug),
        ),
      ),
    );
  });

  it("sorts alphabetically", () => {
    const sorted = sortRecipeList(recipes, "alpha");
    assert.equal(sorted[0]?.title.localeCompare(sorted[1]?.title ?? ""), -1);
  });

  it("builds clean recipe URLs", () => {
    assert.equal(buildRecipesUrl({}), "/recipes");
    assert.equal(buildRecipesUrl({ sort: "latest" }), "/recipes");
    assert.equal(
      buildRecipesUrl({ q: "chicken", category: "main-dishes", sort: "fastest" }),
      "/recipes?q=chicken&category=main-dishes&sort=fastest",
    );
  });

  it("returns empty for unknown collection", () => {
    const result = applyDiscoveryFilters(recipes, { collection: "missing" }, collectionMap);
    assert.equal(result.length, 0);
  });

  it("lists browsable categories with counts and skips empty ones", () => {
    const items = browsableCategoriesWithCounts(
      categories,
      recipes,
      ["cookies", "cakes", "oven", "does-not-exist"],
      { groups: PRIMARY_BROWSE_GROUPS },
    );
    assert.ok(items.every((item) => item.count > 0));
    assert.equal(items[0]?.slug, "cookies");
    assert.ok(items.some((item) => item.slug === "cakes"));
    assert.ok(!items.some((item) => item.slug === "oven"));
  });
});
