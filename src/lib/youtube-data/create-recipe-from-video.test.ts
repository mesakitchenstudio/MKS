import assert from "node:assert/strict";
import { test } from "node:test";
import { videoRowStatus } from "./health";

test("unlinked public videos remain No recipe until linked", () => {
  assert.equal(
    videoRowStatus({
      privacyStatus: "public",
      embeddable: true,
      hasDescriptionChapters: true,
      hasRecipeChapters: false,
    }),
    "No recipe",
  );
});

test("linking a recipe moves No recipe videos to Healthy when chapters exist", () => {
  assert.equal(
    videoRowStatus({
      privacyStatus: "public",
      embeddable: true,
      linkedRecipeId: "recipe-1",
      hasDescriptionChapters: true,
      hasRecipeChapters: false,
    }),
    "Healthy",
  );
});

test("linked recipes without chapters stay Missing chapters for long-form", () => {
  assert.equal(
    videoRowStatus({
      privacyStatus: "public",
      embeddable: true,
      linkedRecipeId: "recipe-1",
      hasDescriptionChapters: false,
      hasRecipeChapters: false,
      format: "LONG",
    }),
    "Missing chapters",
  );
});

test("linked Shorts skip missing chapters health status", () => {
  assert.equal(
    videoRowStatus({
      privacyStatus: "public",
      embeddable: true,
      linkedRecipeId: "recipe-1",
      hasDescriptionChapters: false,
      hasRecipeChapters: false,
      format: "SHORT",
    }),
    "Healthy",
  );
});
