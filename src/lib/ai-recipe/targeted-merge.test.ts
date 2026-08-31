import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeTargetedFillIntoEditor } from "./targeted-merge";
import type { RecipeAiMeta } from "./types";

function meta(): RecipeAiMeta {
  return {
    generatedByAI: true,
    sourceType: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=abc",
    generatedAt: "2026-01-01T00:00:00.000Z",
    model: "test",
    schemaVersion: "v1",
    verificationStatus: "unverified",
    confidenceByPath: {
      title: { confidence: "VERIFIED", sourceNote: "Video" },
      "values.intro": { confidence: "VERIFIED", sourceNote: "Video" },
    },
    summary: { verified: 2, inferred: 0, estimated: 0, unknown: 0 },
  };
}

test("mergeTargetedFillIntoEditor only updates requested paths", () => {
  const result = mergeTargetedFillIntoEditor({
    current: {
      title: "Bread",
      slug: "bread",
      excerpt: "",
      categoryIds: [],
      values: {
        cuisine: "",
        intro: "Keep me",
        ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "", notes: "" }] }],
      },
    },
    draft: {
      excerpt: "Crispy baguettes at home.",
      values: {
        cuisine: "French",
        intro: "SHOULD NOT APPLY",
        ingredients: [],
      },
    },
    requestedPaths: ["excerpt", "values.cuisine"],
    confidenceByPath: {
      excerpt: { confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Targeted AI fill" },
      "values.cuisine": { confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Targeted AI fill" },
    },
    aiMeta: meta(),
  });

  assert.equal(result.excerpt, "Crispy baguettes at home.");
  assert.equal(result.values.cuisine, "French");
  assert.equal(result.values.intro, "Keep me");
  assert.deepEqual(result.values.ingredients, [
    { name: "Dough", items: [{ item: "flour", amount: "", notes: "" }] },
  ]);
  assert.equal(result.aiMeta?.confidenceByPath.title?.confidence, "VERIFIED");
  assert.equal(result.aiMeta?.confidenceByPath.excerpt?.confidence, "HIGH_CONFIDENCE_INFERENCE");
});

test("mergeTargetedFillIntoEditor no-ops safely when draft empty for path", () => {
  const result = mergeTargetedFillIntoEditor({
    current: {
      title: "Bread",
      slug: "bread",
      excerpt: "Existing",
      categoryIds: ["cat-1"],
      values: { cuisine: "French" },
    },
    draft: { excerpt: "", categoryIds: [], values: {} },
    requestedPaths: ["excerpt"],
    confidenceByPath: {},
    aiMeta: meta(),
  });
  assert.equal(result.excerpt, "Existing");
  assert.deepEqual(result.categoryIds, ["cat-1"]);
});

test("mergeTargetedFillIntoEditor merges category suggestions without removing manual picks", () => {
  const result = mergeTargetedFillIntoEditor({
    current: {
      title: "Bread",
      slug: "bread",
      excerpt: "",
      categoryIds: ["cat-breads"],
      values: {},
    },
    draft: {
      excerpt: "",
      categoryIds: ["cat-breads", "cat-oven"],
      values: {},
    },
    requestedPaths: ["categoryIds"],
    confidenceByPath: {
      categoryIds: { confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Targeted AI fill" },
    },
    aiMeta: meta(),
  });
  assert.deepEqual(result.categoryIds, ["cat-breads", "cat-oven"]);
});
