import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { recipes } from "../data/recipes.ts";
import { homepageCollectionSlugMap } from "../data/homepage.ts";
import {
  applyDiscoveryFilters,
  buildDiscoverySuggestions,
  buildRecipesUrl,
  parseDiscoveryParams,
  recipeMatchesDiscoveryCategory,
  sortRecipeList,
} from "./recipe-discovery.ts";
import { scoreRecipeTextMatch, searchRecipesByText, totalMinutes } from "./recipe-utils.ts";
import { hasRecipeYoutube } from "./recipe-youtube.ts";
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

  it("sorts Latest by publishedAt so editorial edits do not resurface old recipes", () => {
    const older = {
      ...recipes[0]!,
      slug: "older-published",
      title: "Older Published",
      publishedAt: "2024-01-01",
      updatedAt: "2026-09-01",
    };
    const newer = {
      ...recipes[1]!,
      slug: "newer-published",
      title: "Newer Published",
      publishedAt: "2025-06-01",
      updatedAt: "2025-06-02",
    };
    const sorted = sortRecipeList([older, newer], "latest");
    assert.equal(sorted[0]?.slug, "newer-published");
    assert.equal(sorted[1]?.slug, "older-published");
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

describe("public recipes Phase 1 editorial discovery UI", () => {
  const root = process.cwd();
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("keeps one Recipes H1 and removes the redundant All recipes H2", () => {
    const page = read("src/app/recipes/page.tsx");
    assert.equal((page.match(/<h1\b/g) || []).length, 1);
    assert.match(page, />Recipes</);
    assert.doesNotMatch(page, /All recipes/);
    assert.match(page, /Recipes tested in the Mesa kitchen/);
    assert.match(page, /aria-label="Recipe discovery"/);
  });

  it("preserves SEO canonical and filtered noindex", () => {
    const page = read("src/app/recipes/page.tsx");
    assert.match(page, /canonical: "\/recipes"/);
    assert.match(page, /index: false/);
    assert.match(page, /params\.time/);
    assert.match(page, /params\.video/);
  });

  it("uses editorial search, category index, and 1/2/3 card grid", () => {
    const discovery = read("src/components/RecipeDiscovery.tsx");
    assert.match(discovery, /Search recipes, ingredients, or techniques/);
    assert.match(discovery, /flex min-h-11 w-full/);
    assert.match(discovery, /Browse by category/);
    assert.match(discovery, /All recipes/);
    assert.match(discovery, /grid-cols-2/);
    assert.match(discovery, /sm:grid-cols-3/);
    assert.match(discovery, /md:grid-cols-4/);
    assert.doesNotMatch(discovery, /rounded-full px-3 py-1/);
    assert.doesNotMatch(discovery, /overflow-x-auto/);
    assert.match(discovery, /aria-pressed=\{isSelected\}/);
    assert.match(discovery, /text-ink\/75 hover:text-terracotta/);
    assert.match(discovery, /border-b-2 border-terracotta font-semibold text-terracotta/);
    assert.match(discovery, /grid gap-8 sm:grid-cols-2 lg:grid-cols-3/);
    assert.doesNotMatch(discovery, /xl:grid-cols-4/);
    assert.match(discovery, /imageAspect="4\/3"/);
    assert.match(discovery, /excerptLines=\{2\}/);
    assert.match(discovery, /Clear filters/);
    assert.doesNotMatch(discovery, /aria-label="Clear search"/);
    assert.match(discovery, /No recipes found/);
  });

  it("wires lightweight discovery analytics without blocking navigation", () => {
    const discovery = read("src/components/RecipeDiscovery.tsx");
    assert.match(discovery, /recipe_discovery_search/);
    assert.match(discovery, /recipe_discovery_category_select/);
    assert.match(discovery, /recipe_discovery_sort_change/);
    assert.match(discovery, /recipe_discovery_recipe_click/);
    assert.match(discovery, /placement: DISCOVERY_PLACEMENT/);
    assert.match(discovery, /never block navigation/);
    const analytics = read("src/lib/analytics.ts");
    assert.match(analytics, /recipe_discovery_search/);
    assert.match(analytics, /search_query\?:/);
  });

  it("uses shared card title resolver and omits empty excerpts", () => {
    const card = read("src/components/RecipeGridCard.tsx");
    assert.match(card, /resolveRecipeCardTitle/);
    assert.match(card, /\{cardTitle\}/);
    assert.match(card, /excerpt \? \(/);
  });

  it("aligns time/yield metadata across equal-height grid rows", () => {
    const card = read("src/components/RecipeGridCard.tsx");
    assert.match(card, /group flex h-full flex-col/);
    assert.match(card, /flex h-full flex-col/);
    assert.match(card, /flex min-h-0 flex-1 flex-col/);
    assert.match(card, /mt-auto text-muted/);
    assert.match(card, /line-clamp-2/);
    assert.doesNotMatch(card, /excerpt\.slice\(|substring\(|truncateExcerpt/);
    assert.doesNotMatch(card, /absolute.*(min|cookies|servings)|top-\[|bottom-\[/);
    assert.doesNotMatch(card, /min-h-\[\d{3,}px\]/);
    const discovery = read("src/components/RecipeDiscovery.tsx");
    assert.match(discovery, /grid gap-8 sm:grid-cols-2 lg:grid-cols-3/);
    assert.doesNotMatch(discovery, /items-start/);
  });

  it("keeps collection compatibility and category URL helpers", () => {
    assert.equal(
      buildRecipesUrl({ category: "toppings" }),
      "/recipes?category=toppings",
    );
    assert.equal(parseDiscoveryParams({ category: "all" }).category, undefined);
    assert.equal(
      buildRecipesUrl({ q: "chicken", category: "main-dishes", sort: "alpha" }),
      "/recipes?q=chicken&category=main-dishes&sort=alpha",
    );
    const discovery = read("src/components/RecipeDiscovery.tsx");
    assert.match(discovery, /collectionTitles/);
    assert.match(discovery, /collection: undefined/);
  });
});

describe("phase 3A discovery filters and ranking", () => {
  const collectionMap = homepageCollectionSlugMap();
  const root = process.cwd();
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("parses and builds time / video / cuisine / method URL state", () => {
    const params = parseDiscoveryParams({
      time: "60",
      video: "1",
      cuisine: "Italian",
      method: "Oven",
    });
    assert.equal(params.time, "60");
    assert.equal(params.video, true);
    assert.equal(params.cuisine, "Italian");
    assert.equal(params.method, "Oven");
    assert.equal(
      buildRecipesUrl(params),
      "/recipes?time=60&video=1&cuisine=Italian&method=Oven",
    );
    assert.equal(parseDiscoveryParams({ time: "nope", video: "0" }).time, undefined);
    assert.equal(parseDiscoveryParams({ video: "0" }).video, undefined);
  });

  it("filters by totalMinutes time buckets without inventing times", () => {
    const underHour = applyDiscoveryFilters(recipes, { time: "60" }, collectionMap);
    assert.ok(underHour.length > 0);
    assert.ok(underHour.every((recipe) => totalMinutes(recipe) > 0 && totalMinutes(recipe) <= 60));

    const overTwo = applyDiscoveryFilters(recipes, { time: "over" }, collectionMap);
    assert.ok(overTwo.every((recipe) => totalMinutes(recipe) > 120));
  });

  it("filters video recipes using hasRecipeYoutube semantics", () => {
    const withVideo = applyDiscoveryFilters(recipes, { video: true }, collectionMap);
    assert.ok(withVideo.every((recipe) => hasRecipeYoutube(recipe)));
  });

  it("ranks title matches above excerpt-only mentions", () => {
    const baguette = {
      ...recipes[0]!,
      slug: "classic-french-baguettes",
      title: "Classic French Baguettes",
      dishName: "Baguettes",
      excerpt: "Crisp crust.",
      ingredients: [{ items: [{ item: "flour", amount: "500 g" }] }],
    };
    const mention = {
      ...recipes[1]!,
      slug: "soup-with-croutons",
      title: "Tomato Soup",
      dishName: "Tomato Soup",
      excerpt: "Serve with leftover baguette slices.",
      ingredients: [{ items: [{ item: "tomatoes", amount: "4" }] }],
    };
    const ranked = applyDiscoveryFilters(
      [mention, baguette],
      { q: "baguette" },
      collectionMap,
    );
    assert.equal(ranked[0]?.slug, "classic-french-baguettes");
    assert.ok(scoreRecipeTextMatch(baguette, "baguette") > scoreRecipeTextMatch(mention, "baguette"));
  });

  it("supports prefix partial matches without distant fuzzy noise", () => {
    const ranked = searchRecipesByText(recipes, "focac");
    assert.ok(ranked.some((row) => row.recipe.slug === "herb-focaccia"));
    assert.equal(searchRecipesByText(recipes, "zzzznotarecipe").length, 0);
  });

  it("builds autocomplete suggestions for recipes and categories", () => {
    const suggestions = buildDiscoverySuggestions({ query: "bre", recipes, limit: 8 });
    assert.ok(suggestions.some((item) => item.kind === "category" && item.id === "breads"));
    assert.ok(suggestions.some((item) => item.kind === "recipe"));
  });

  it("keeps SearchOverlay on the shared haystack and video-aware results", () => {
    const overlay = read("src/components/SearchOverlay.tsx");
    assert.match(overlay, /hasVideo/);
    assert.match(overlay, /View all results on Recipes/);
    assert.match(overlay, /buildRecipesUrl/);
    assert.match(overlay, /With video/);
    assert.match(overlay, /searchOverlayRecipesByText/);
    assert.doesNotMatch(overlay, /site\.social\.youtube/);
    const layout = read("src/app/layout.tsx");
    assert.match(layout, /hasVideo: hasRecipeYoutube\(recipe\)/);
  });

  it("exposes restrained refine controls without difficulty facet", () => {
    const discovery = read("src/components/RecipeDiscovery.tsx");
    assert.match(discovery, /Refine/);
    assert.match(discovery, /DISCOVERY_TIME_OPTIONS/);
    assert.match(discovery, /Has video/);
    assert.match(discovery, /buildDiscoverySuggestions/);
    assert.doesNotMatch(discovery, /Difficulty/);
  });
});
