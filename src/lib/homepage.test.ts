import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { homepageConfig } from "../data/homepage.ts";
import { recipes } from "../data/recipes.ts";
import type { Recipe } from "../data/types.ts";
import {
  PRIMARY_CATEGORY_LABELS,
  PRIMARY_CATEGORY_SLUGS,
} from "./recipe-primary-taxonomy.ts";
import { isHomepageEligibleRecipe } from "./homepage-eligibility.ts";
import { RECIPE_IMAGE_FALLBACK } from "./recipe-images.ts";
import {
  homepageUsedRecipeSlugs,
  resolveHomepage,
  summarizeHomepageCandidates,
} from "./homepage.ts";

function cloneRecipe(recipe: Recipe, patch: Partial<Recipe> = {}): Recipe {
  return { ...recipe, ...patch };
}

const COOKIES_SLUG = "chocolate-chunk-cookies";

describe("homepage curation", () => {
  it("uses manual featured slug when eligible", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: "salsa-verde" });
    assert.equal(page.hero?.slug, "salsa-verde");
    assert.equal(page.heroEyebrow, "From the studio");
  });

  it("falls back when manual featured slug is ineligible", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: "breakfast-tortillas" });
    assert.notEqual(page.hero?.slug, "breakfast-tortillas");
    assert.ok(page.hero);
  });

  it("uses latest eligible recipe when no manual feature", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: null });
    assert.ok(page.hero);
    assert.equal(isHomepageEligibleRecipe(page.hero!), true);
  });

  it("excludes hero from latest and caps at four", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: "salsa-verde" });
    assert.ok(page.latest.length <= 4);
    assert.ok(!page.latest.some((recipe) => recipe.slug === page.hero?.slug));
  });

  it("orders latest by published date newest first", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: null });
    if (page.latest.length < 2) return;
    const first = Date.parse(page.latest[0]!.publishedAt);
    const second = Date.parse(page.latest[1]!.publishedAt);
    assert.ok(first >= second);
  });

  it("excludes recipes without usable images from hero and latest", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: null });
    for (const recipe of [page.hero, ...page.latest]) {
      if (!recipe) continue;
      assert.equal(isHomepageEligibleRecipe(recipe), true);
    }
    assert.ok(!page.latest.some((recipe) => recipe.slug === "breakfast-tortillas"));
    assert.ok(!page.latest.some((recipe) => recipe.slug === "roasted-market-vegetables"));
  });

  it("does not resolve legacy homepage collection modules", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: null });
    assert.equal("collections" in page, false);
  });

  it("supports text-only hero when no eligible recipes exist", () => {
    const ineligible = recipes.map((recipe) => cloneRecipe(recipe, { image: "" }));
    const page = resolveHomepage(ineligible, { featuredRecipeSlug: null });
    assert.equal(page.hero, null);
    assert.equal(page.latest.length, 0);
  });

  it("keeps legacy collection slug map for /recipes URLs", () => {
    const ids = homepageConfig.collections.map((collection) => collection.id);
    assert.ok(ids.includes("summer-at-the-table"));
    assert.ok(ids.includes("cookies-and-sweets"));
    assert.ok(ids.includes("best-breakfast"));
    assert.ok(ids.includes("easy-dinners"));
  });

  it("uses All recipes CTA config", () => {
    assert.equal(homepageConfig.latest.viewMoreLabel, "All recipes →");
    assert.equal(homepageConfig.latest.href, "/recipes");
  });

  it("lists approved browse categories from primary taxonomy", () => {
    const expected = [
      "breakfast",
      "breads",
      "main-dishes",
      "side-dishes",
      "desserts",
      "drinks",
      "toppings",
    ];
    assert.deepEqual([...PRIMARY_CATEGORY_SLUGS], expected);
    assert.equal(PRIMARY_CATEGORY_LABELS.toppings, "Condiments");
    assert.ok(!PRIMARY_CATEGORY_SLUGS.includes("cookies" as never));
    assert.ok(!PRIMARY_CATEGORY_SLUGS.includes("cakes" as never));
  });

  it("disables legacy homepage collection modules in config", () => {
    for (const collection of homepageConfig.collections) {
      assert.equal(collection.enabled, false);
    }
  });

  it("suppresses footer newsletter on homepage only", () => {
    const chrome = readFileSync(join(process.cwd(), "src/components/PublicChrome.tsx"), "utf8");
    assert.match(chrome, /hideNewsletter=\{pathname === "\/"\}/);
    const footer = readFileSync(join(process.cwd(), "src/components/SiteFooter.tsx"), "utf8");
    assert.match(footer, /hideNewsletter/);
  });

  it("hides latest when fewer than three candidates remain after hero", () => {
    const tinyCatalog = recipes.slice(0, 4).map((recipe) =>
      cloneRecipe(recipe, { image: RECIPE_IMAGE_FALLBACK }),
    );
    const oneGood = cloneRecipe(recipes[0]!);
    const page = resolveHomepage([oneGood, ...tinyCatalog], { featuredRecipeSlug: null });
    assert.equal(page.hero?.slug, oneGood.slug);
    assert.equal(page.latest.length, 0);
  });

  it("renders from kitchen only when three unique eligible recipes are configured", () => {
    const slugs = ["herb-focaccia", "citrus-olive-oil-cake", "salsa-verde"];
    const page = resolveHomepage(recipes, {
      featuredRecipeSlug: COOKIES_SLUG,
      fromKitchenSlugs: slugs,
    });
    assert.equal(page.fromKitchen.length, 3);
    assert.deepEqual(page.fromKitchen.map((r) => r.slug), slugs);
  });

  it("skips from kitchen when fewer than three eligible unique recipes", () => {
    const page = resolveHomepage(recipes, {
      featuredRecipeSlug: COOKIES_SLUG,
      fromKitchenSlugs: ["herb-focaccia", "citrus-olive-oil-cake"],
    });
    assert.equal(page.fromKitchen.length, 0);
  });

  it("does not duplicate slugs across hero, latest, and from kitchen", () => {
    const page = resolveHomepage(recipes, {
      featuredRecipeSlug: COOKIES_SLUG,
      fromKitchenSlugs: [
        "herb-focaccia",
        "citrus-olive-oil-cake",
        "salsa-verde",
        COOKIES_SLUG,
      ],
    });
    const used = homepageUsedRecipeSlugs(page);
    const unique = new Set(used);
    assert.equal(unique.size, used.length);
    assert.ok(!page.latest.some((recipe) => recipe.slug === COOKIES_SLUG));
    assert.ok(!page.fromKitchen.some((recipe) => recipe.slug === COOKIES_SLUG));
  });

  it("regression: chocolate chunk cookies cannot appear in hero AND latest AND from kitchen", () => {
    const page = resolveHomepage(recipes, {
      featuredRecipeSlug: COOKIES_SLUG,
      fromKitchenSlugs: [
        COOKIES_SLUG,
        "herb-focaccia",
        "citrus-olive-oil-cake",
        "salsa-verde",
      ],
    });
    assert.equal(page.hero?.slug, COOKIES_SLUG);
    assert.ok(!page.latest.some((recipe) => recipe.slug === COOKIES_SLUG));
    assert.ok(!page.fromKitchen.some((recipe) => recipe.slug === COOKIES_SLUG));
    const used = homepageUsedRecipeSlugs(page);
    const cookieCount = used.filter((slug) => slug === COOKIES_SLUG).length;
    assert.equal(cookieCount, 1);
  });

  it("static catalog yields a varied homepage candidate set", () => {
    const summary = summarizeHomepageCandidates(recipes, { featuredRecipeSlug: null });
    assert.ok(summary.hardEligibleCount >= 8);
    assert.ok(summary.latestCandidates.length >= 3);
    assert.ok(summary.heroCandidates.length >= 3);
  });
});
