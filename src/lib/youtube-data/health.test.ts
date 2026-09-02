import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { videoContentHealthStatus } from "./health.ts";

const base = {
  privacyStatus: "public",
  embeddable: true,
  hasDescriptionChapters: false,
  hasRecipeChapters: false,
};

const caesarValues = {
  instructions: [
    { name: "Make the Caesar Dressing", steps: ["a"] },
    { name: "Prepare the Chicken", steps: ["b"] },
    { name: "Assemble the Salad", steps: ["c"] },
    { name: "Finish and Serve", steps: ["d"] },
  ],
};

function staffStartMeta(sectionCount: number): RecipeAiMeta {
  const fieldProvenance: RecipeAiMeta["fieldProvenance"] = {};
  for (let index = 0; index < sectionCount; index += 1) {
    fieldProvenance[`values.instructions.${index}.startTimestamp`] = {
      aiGenerated: false,
      humanModifiedAfterGeneration: true,
      reviewState: "edited",
      source: "staff",
    };
  }
  return {
    fieldProvenance,
    generatedByAI: false,
    verificationStatus: "unverified",
  };
}

describe("videoContentHealthStatus", () => {
  it("does not require chapters for Shorts", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "SHORT",
      }),
      "—",
    );
  });

  it("returns em dash for unlinked long-form", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        format: "LONG",
      }),
      "—",
    );
  });

  it("returns Needs timestamps for linked long-form without mapped starts", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "LONG",
        recipeValues: caesarValues,
      }),
      "Needs timestamps",
    );
  });

  it("returns Chapters OK when all instruction timestamps are trusted staff mappings", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "LONG",
        recipeValues: {
          instructions: caesarValues.instructions.map((row, index) => ({
            ...row,
            startTimestamp: index * 45,
          })),
        },
        recipeAiMeta: staffStartMeta(4),
      }),
      "Chapters OK",
    );
  });

  it("returns Needs timestamps when only legacy AI timestamps exist", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "LONG",
        recipeValues: {
          instructions: caesarValues.instructions.map((row, index) => ({
            ...row,
            startTimestamp: index * 45,
          })),
        },
      }),
      "Needs timestamps",
    );
  });

  it("returns Partially mapped when only some timestamps are trusted", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "LONG",
        recipeValues: {
          instructions: [
            { name: "Make the Caesar Dressing", steps: ["a"], startTimestamp: 0 },
            { name: "Prepare the Chicken", steps: ["b"] },
            { name: "Assemble the Salad", steps: ["c"] },
            { name: "Finish and Serve", steps: ["d"] },
          ],
        },
        recipeAiMeta: staffStartMeta(1),
      }),
      "Partially mapped",
    );
  });

  it("returns Metadata issue before chapter mapping when flagged", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "LONG",
        hasMetadataIssue: true,
        recipeValues: caesarValues,
      }),
      "Metadata issue",
    );
  });
});
