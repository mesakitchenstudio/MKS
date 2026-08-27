import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRecipeImageSrc, RECIPE_IMAGE_FALLBACK } from "./recipe-images.ts";

describe("recipe images", () => {
  it("normalizes empty and whitespace sources to null", () => {
    assert.equal(normalizeRecipeImageSrc(""), null);
    assert.equal(normalizeRecipeImageSrc("   "), null);
    assert.equal(normalizeRecipeImageSrc(undefined), null);
  });

  it("trims valid sources", () => {
    assert.equal(normalizeRecipeImageSrc("  /photo.jpg  "), "/photo.jpg");
  });

  it("exposes a quiet fallback asset", () => {
    assert.equal(RECIPE_IMAGE_FALLBACK, "/recipe-image-fallback.svg");
  });
});
