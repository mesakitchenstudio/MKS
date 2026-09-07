import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RELATED_RECIPE_MANUAL_MAX,
  parseRelatedRecipeIds,
  serializeRelatedRecipeIds,
} from "./recipe-related-overrides.ts";

describe("recipe-related-overrides", () => {
  it("caps and dedupes related recipe ids", () => {
    const many = Array.from({ length: RELATED_RECIPE_MANUAL_MAX + 3 }, (_, i) => `id-${i}`);
    assert.equal(parseRelatedRecipeIds(many).length, RELATED_RECIPE_MANUAL_MAX);
    assert.equal(serializeRelatedRecipeIds(["a", "a", "b"]), '["a","b"]');
  });

  it("fails closed on malformed input", () => {
    assert.deepEqual(parseRelatedRecipeIds(""), []);
    assert.deepEqual(parseRelatedRecipeIds(42), []);
    assert.deepEqual(parseRelatedRecipeIds({ id: "x" }), []);
  });
});
