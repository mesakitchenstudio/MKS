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
import { resolveHomepage } from "./homepage.ts";

function cloneRecipe(recipe: Recipe, patch: Partial<Recipe> = {}): Recipe {
  return { ...recipe, ...patch };
}

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
});
