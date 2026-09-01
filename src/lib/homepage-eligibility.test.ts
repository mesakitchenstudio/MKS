import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homepageConfig } from "../data/homepage.ts";
import { recipes } from "../data/recipes.ts";
import type { Recipe } from "../data/types.ts";
import { isHomepageEligibleRecipe } from "./homepage-eligibility.ts";
import { RECIPE_IMAGE_FALLBACK } from "./recipe-images.ts";

describe("homepage eligibility", () => {
  it("requires title, excerpt, and a non-fallback image", () => {
    const base = recipes[0];
    assert.equal(isHomepageEligibleRecipe(base), true);
    assert.equal(isHomepageEligibleRecipe({ ...base, image: "" }), false);
    assert.equal(isHomepageEligibleRecipe({ ...base, image: RECIPE_IMAGE_FALLBACK }), false);
    assert.equal(isHomepageEligibleRecipe({ ...base, excerpt: "" }), false);
  });
});
