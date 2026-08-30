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

test("linked recipes without chapters stay Missing chapters", () => {
  assert.equal(
    videoRowStatus({
      privacyStatus: "public",
      embeddable: true,
      linkedRecipeId: "recipe-1",
      hasDescriptionChapters: false,
      hasRecipeChapters: false,
    }),
    "Missing chapters",
  );
});
