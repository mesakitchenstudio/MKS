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

test("linking a recipe with mapped instruction timestamps is Healthy", () => {
  assert.equal(
    videoRowStatus({
      privacyStatus: "public",
      embeddable: true,
      linkedRecipeId: "recipe-1",
      hasDescriptionChapters: true,
      hasRecipeChapters: false,
      format: "LONG",
      recipeValues: {
        instructions: [{ name: "Mix", steps: ["a"], startTimestamp: 0 }],
      },
      recipeAiMeta: {
        fieldProvenance: {
          "values.instructions.0.startTimestamp": {
            aiGenerated: false,
            humanModifiedAfterGeneration: true,
            reviewState: "edited",
            source: "staff",
          },
        },
        generatedByAI: false,
        verificationStatus: "unverified",
      },
    }),
    "Healthy",
  );
});

test("linked recipes without mapped timestamps stay Missing chapters for long-form", () => {
  assert.equal(
    videoRowStatus({
      privacyStatus: "public",
      embeddable: true,
      linkedRecipeId: "recipe-1",
      hasDescriptionChapters: false,
      hasRecipeChapters: false,
      format: "LONG",
      recipeValues: {
        instructions: [
          { name: "Make the Caesar Dressing", steps: ["a"] },
          { name: "Prepare the Chicken", steps: ["b"] },
        ],
      },
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
