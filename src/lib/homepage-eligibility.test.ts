import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipes } from "../data/recipes.ts";
import type { Recipe } from "../data/types.ts";
import {
  assessHomepageRecipeEligibility,
  auditHomepageRecipeEligibility,
  homepageEligibleRecipes,
  isHomepageEligibleRecipe,
} from "./homepage-eligibility.ts";
import { RECIPE_IMAGE_FALLBACK } from "./recipe-images.ts";

function clone(recipe: Recipe, patch: Partial<Recipe> = {}): Recipe {
  return { ...recipe, ...patch };
}

describe("homepage eligibility — hard vs soft", () => {
  const publishedWithUnsplash = clone(recipes.find((r) => r.slug === "vanilla-bean-cupcakes")!);

  it("published recipe + usable Unsplash image: eligible with soft warning", () => {
    const assessment = assessHomepageRecipeEligibility(publishedWithUnsplash);
    assert.equal(assessment.hardEligible, true);
    assert.equal(isHomepageEligibleRecipe(publishedWithUnsplash), true);
    assert.ok(assessment.softWarnings.length > 0);
  });

  it("published recipe + missing image: ineligible", () => {
    const assessment = assessHomepageRecipeEligibility(clone(publishedWithUnsplash, { image: "" }));
    assert.equal(assessment.hardEligible, false);
    assert.ok(assessment.hardBlockers.includes("missing image"));
  });

  it("published recipe + Mesa fallback: ineligible", () => {
    const assessment = assessHomepageRecipeEligibility(
      clone(publishedWithUnsplash, { image: RECIPE_IMAGE_FALLBACK }),
    );
    assert.equal(assessment.hardEligible, false);
    assert.ok(assessment.hardBlockers.includes("mesa fallback image"));
  });

  it("unpublished draft: ineligible", () => {
    const assessment = assessHomepageRecipeEligibility(
      clone(publishedWithUnsplash, { status: "draft" }),
    );
    assert.equal(assessment.hardEligible, false);
    assert.ok(assessment.hardBlockers.includes("unpublished"));
  });

  it("critical missing required content: ineligible", () => {
    assert.equal(isHomepageEligibleRecipe(clone(publishedWithUnsplash, { excerpt: "" })), false);
    assert.equal(isHomepageEligibleRecipe(clone(publishedWithUnsplash, { title: "" })), false);
    assert.equal(isHomepageEligibleRecipe(clone(publishedWithUnsplash, { imageAlt: "" })), false);
  });

  it("stock/Unsplash warning alone does not exclude", () => {
    const unsplashRecipes = recipes.filter((recipe) =>
      /images\.unsplash\.com/i.test(recipe.image),
    );
    assert.ok(unsplashRecipes.length > 0);
    for (const recipe of unsplashRecipes) {
      const assessment = assessHomepageRecipeEligibility(recipe);
      assert.equal(assessment.hardEligible, true, `${recipe.slug} should be hard-eligible`);
    }
  });

  it("static catalog has more than one hard-eligible recipe", () => {
    const eligible = homepageEligibleRecipes(recipes);
    assert.ok(eligible.length >= 3);
  });

  it("audit marks empty-image recipes as hard-excluded", () => {
    const audit = auditHomepageRecipeEligibility(recipes);
    const tortillas = audit.find((row) => row.slug === "breakfast-tortillas");
    const vegetables = audit.find((row) => row.slug === "roasted-market-vegetables");
    assert.equal(tortillas?.hardEligible, false);
    assert.equal(vegetables?.hardEligible, false);
    assert.ok(tortillas?.exclusionReasons.includes("missing image"));
  });
});
