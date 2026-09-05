import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipes } from "../data/recipes.ts";
import { homepageCollectionSlugMap } from "../data/homepage.ts";
import {
  applyDiscoveryFilters,
  buildRecipesUrl,
  parseDiscoveryParams,
  recipeMatchesDiscoveryCategory,
  sortRecipeList,
} from "./recipe-discovery.ts";
import {
  PRIMARY_CATEGORY_SLUGS,
  PRIMARY_PUBLIC_FILTERS,
  recipeMatchesPrimaryCategory,
  recipePrimaryCategoryDisplayLabel,
  resolveRecipePrimaryCategorySlug,
} from "./recipe-primary-taxonomy.ts";

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
      result.every((recipe) => recipeMatchesDiscoveryCategory(recipe, "desserts")),
    );
  });

  it("intersects search and category filters", () => {
    const filtered = applyDiscoveryFilters(
      recipes,
      { q: "weeknight chile", category: "main-dishes" },
      collectionMap,
    );
    assert.deepEqual(filtered.map((recipe) => recipe.slug), ["weeknight-chile"]);
  });

  it("sorts alphabetically", () => {
    const sorted = sortRecipeList(recipes, "alpha");
    assert.equal(sorted[0]?.title.localeCompare(sorted[1]?.title ?? ""), -1);
  });

  it("builds clean recipe URLs", () => {
    assert.equal(buildRecipesUrl({}), "/recipes");
    assert.equal(buildRecipesUrl({ sort: "latest" }), "/recipes");
    assert.equal(
      buildRecipesUrl({ q: "chicken", category: "main-dishes", sort: "alpha" }),
      "/recipes?q=chicken&category=main-dishes&sort=alpha",
    );
  });

  it("returns empty for unknown collection", () => {
    const result = applyDiscoveryFilters(recipes, { collection: "missing" }, collectionMap);
    assert.equal(result.length, 0);
  });
});

describe("primary public taxonomy", () => {
  it("uses one primary filter vocabulary without dessert children as peers", () => {
    const labels = PRIMARY_PUBLIC_FILTERS.map((item) => item.label);
    assert.deepEqual(labels, [
      "All",
      "Breakfast",
      "Breads",
      "Main Dishes",
      "Side Dishes",
      "Desserts",
      "Drinks",
      "Condiments",
    ]);
    assert.ok(!labels.includes("Cakes"));
    assert.ok(!labels.includes("Cookies"));
    assert.ok(!labels.includes("Brownies & Bars"));
  });

  it("maps bread type recipes into Breads even when course text differs", () => {
    const breadTypeRecipe = {
      ...recipes.find((recipe) => recipe.slug === "herb-focaccia")!,
      categories: ["breakfast", "oven"],
      course: "Bread",
      typeName: "Bread",
    };
    assert.equal(resolveRecipePrimaryCategorySlug(breadTypeRecipe), "breads");
    assert.equal(recipePrimaryCategoryDisplayLabel(breadTypeRecipe), "Breads");
    assert.equal(recipeMatchesPrimaryCategory(breadTypeRecipe, "breads"), true);
  });

  it("counts breads by type and category membership", () => {
    const collectionMap = homepageCollectionSlugMap();
    const breadLike = {
      ...recipes[0],
      slug: "bakery-baguettes",
      title: "Bakery-Style French Baguettes",
      categories: ["oven"],
      course: "Bread",
      typeName: "Bread",
    };
    const all = [...recipes, breadLike];
    const breads = applyDiscoveryFilters(all, { category: "breads" }, collectionMap);
    assert.ok(breads.some((recipe) => recipe.slug === "herb-focaccia"));
    assert.ok(breads.some((recipe) => recipe.slug === "bakery-baguettes"));
  });

  it("uses primary labels on cards instead of raw course text", () => {
    const focaccia = recipes.find((recipe) => recipe.slug === "herb-focaccia");
    assert.ok(focaccia);
    assert.equal(recipePrimaryCategoryDisplayLabel(focaccia!), "Breads");
    const chile = recipes.find((recipe) => recipe.slug === "weeknight-chile");
    assert.ok(chile);
    assert.equal(recipePrimaryCategoryDisplayLabel(chile!), "Main Dishes");
  });

  it("maps condiments from toppings slug", () => {
    const salsa = recipes.find((recipe) => recipe.slug === "salsa-verde");
    assert.ok(salsa);
    assert.equal(resolveRecipePrimaryCategorySlug(salsa!), "toppings");
    assert.equal(recipePrimaryCategoryDisplayLabel(salsa!), "Condiments");
  });

  it("exposes footer-aligned primary slugs", () => {
    assert.deepEqual([...PRIMARY_CATEGORY_SLUGS], [
      "breakfast",
      "breads",
      "main-dishes",
      "side-dishes",
      "desserts",
      "drinks",
      "toppings",
    ]);
  });

  it("uses editorial course/type for iced horchata primary, not category order", () => {
    const horchata = recipes.find((recipe) => recipe.slug === "iced-horchata-coffee");
    assert.ok(horchata);
    assert.equal(recipePrimaryCategoryDisplayLabel(horchata!), "Drinks");
    assert.equal(resolveRecipePrimaryCategorySlug(horchata!), "drinks");
    assert.equal(recipeMatchesPrimaryCategory(horchata!, "drinks"), true);
    assert.equal(recipeMatchesPrimaryCategory(horchata!, "breakfast"), true);
  });

  it("does not change primary label when category slug order changes", () => {
    const base = recipes.find((recipe) => recipe.slug === "iced-horchata-coffee")!;
    const drinksFirst = { ...base, categories: ["drinks", "breakfast", "no-bake", "summer"] };
    const breakfastFirst = { ...base, categories: ["breakfast", "drinks", "no-bake", "summer"] };
    assert.equal(resolveRecipePrimaryCategorySlug(drinksFirst), "drinks");
    assert.equal(resolveRecipePrimaryCategorySlug(breakfastFirst), "drinks");
    assert.equal(recipePrimaryCategoryDisplayLabel(drinksFirst), "Drinks");
    assert.equal(recipePrimaryCategoryDisplayLabel(breakfastFirst), "Drinks");
  });

  it("prefers RecipeType over competing primary category slugs", () => {
    const fromType = {
      ...recipes[0],
      slug: "typed-drink",
      course: "Breakfast",
      categories: ["breakfast", "drinks"],
      typeName: "Drink",
    };
    assert.equal(resolveRecipePrimaryCategorySlug(fromType), "drinks");
    assert.equal(recipePrimaryCategoryDisplayLabel(fromType), "Drinks");
    assert.equal(recipeMatchesPrimaryCategory(fromType, "breakfast"), true);
    assert.equal(recipeMatchesPrimaryCategory(fromType, "drinks"), true);
  });

  it("maps Condiment RecipeType to Condiments card label until type is corrected in CMS", () => {
    const misTypedMain = {
      ...recipes[0],
      slug: "salad-typed-as-condiment",
      title: "Chicken Caesar Salad",
      course: "Main",
      categories: ["main-dishes", "toppings"],
      typeName: "Condiment",
    };
    assert.equal(resolveRecipePrimaryCategorySlug(misTypedMain), "toppings");
    assert.equal(recipePrimaryCategoryDisplayLabel(misTypedMain), "Condiments");

    const corrected = { ...misTypedMain, typeName: "Main", categories: ["main-dishes"] };
    assert.equal(resolveRecipePrimaryCategorySlug(corrected), "main-dishes");
    assert.equal(recipePrimaryCategoryDisplayLabel(corrected), "Main Dishes");
  });

  it("keeps dessert child union filtering functional", () => {
    const collectionMap = homepageCollectionSlugMap();
    const desserts = applyDiscoveryFilters(recipes, { category: "desserts" }, collectionMap);
    assert.ok(desserts.some((recipe) => recipe.categories.includes("cookies")));
    assert.ok(desserts.some((recipe) => recipe.categories.includes("cakes")));
    assert.ok(desserts.some((recipe) => recipe.categories.includes("brownies-bars")));
  });
});
