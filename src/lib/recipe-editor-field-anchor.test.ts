import assert from "node:assert/strict";
import { test } from "node:test";
import { recipeFieldAnchorId } from "./recipe-editor-field-anchor";

test("recipeFieldAnchorId produces stable hash-friendly ids", () => {
  assert.equal(recipeFieldAnchorId("holiday"), "field-holiday");
  assert.equal(recipeFieldAnchorId("whyItWorks"), "field-why-it-works");
  assert.equal(recipeFieldAnchorId("title"), "field-title");
});
