import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isFieldEligibleForTargetedFill,
  listMissingAiFillableFields,
} from "./missing-fields";
import type { RecipeAiMeta } from "./types";
import type { SchemaField } from "./schema-version";

const fields: SchemaField[] = [
  { key: "cuisine", label: "Cuisine", kind: "text", required: false },
  { key: "notes", label: "Notes", kind: "textarea", required: false },
  { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
  { key: "instructions", label: "Instructions", kind: "instructions", required: true },
  { key: "imageAlt", label: "Image description", kind: "text", required: false },
  { key: "image", label: "Hero image", kind: "image", required: false },
];

function meta(partial: Partial<RecipeAiMeta> = {}): RecipeAiMeta {
  return {
    generatedByAI: true,
    sourceType: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=abc",
    generatedAt: "2026-01-01T00:00:00.000Z",
    model: "test",
    schemaVersion: "v1",
    verificationStatus: "unverified",
    confidenceByPath: {},
    summary: { verified: 2, inferred: 1, estimated: 0, unknown: 1 },
    ...partial,
  };
}

test("listMissingAiFillableFields includes empty fillable fields", () => {
  const result = listMissingAiFillableFields({
    fields,
    title: "Bread",
    slug: "bread",
    excerpt: "",
    values: {
      cuisine: "",
      notes: "Already written",
      ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "1 cup", notes: "" }] }],
      instructions: [{ name: "Mix", steps: ["Combine"] }],
      imageAlt: "",
      image: "https://example.com/hero.jpg",
    },
    aiMeta: meta(),
  });

  const keys = result.missing.map((row) => row.key);
  assert.ok(keys.includes("excerpt"));
  assert.ok(keys.includes("cuisine"));
  assert.ok(keys.includes("imageAlt"));
  assert.ok(!keys.includes("notes"));
  assert.ok(!keys.includes("ingredients"));
  assert.ok(!keys.includes("instructions"));
  assert.ok(!keys.includes("image"));
  assert.equal(result.counts.verified, 2);
});

test("listMissingAiFillableFields includes UNKNOWN confidence as needs_input", () => {
  const result = listMissingAiFillableFields({
    fields,
    title: "Bread",
    slug: "bread",
    excerpt: "Short blurb",
    values: { cuisine: "French", notes: "", imageAlt: "alt" },
    aiMeta: meta({
      confidenceByPath: {
        "values.cuisine": { confidence: "UNKNOWN", sourceNote: "Needs input" },
      },
    }),
  });

  const cuisine = result.missing.find((row) => row.key === "cuisine");
  assert.ok(cuisine);
  assert.equal(cuisine?.reason, "needs_input");
});

test("listMissingAiFillableFields skips VERIFIED and human-modified fields", () => {
  const result = listMissingAiFillableFields({
    fields,
    title: "Bread",
    slug: "bread",
    excerpt: "",
    values: { cuisine: "", notes: "" },
    aiMeta: meta({
      confidenceByPath: {
        excerpt: { confidence: "VERIFIED", sourceNote: "From video" },
      },
      fieldProvenance: {
        "values.notes": {
          aiGenerated: true,
          aiGeneratedValue: "",
          humanModifiedAfterGeneration: true,
        },
      },
    }),
  });

  const keys = result.missing.map((row) => row.key);
  assert.ok(!keys.includes("excerpt"));
  assert.ok(!keys.includes("notes"));
  assert.ok(keys.includes("cuisine"));
});

test("listMissingAiFillableFields includes empty categories", () => {
  const result = listMissingAiFillableFields({
    fields,
    title: "Bread",
    slug: "bread",
    excerpt: "Short blurb",
    categoryIds: [],
    values: { cuisine: "French", notes: "Done", imageAlt: "alt" },
    aiMeta: meta(),
  });

  assert.ok(result.missing.some((row) => row.path === "categoryIds"));
});

test("isFieldEligibleForTargetedFill blocks protected and verified paths", () => {
  assert.equal(
    isFieldEligibleForTargetedFill({
      path: "values.ingredients",
      key: "ingredients",
      kind: "ingredients",
      value: [],
      allowRepopulate: true,
    }),
    false,
  );
  assert.equal(
    isFieldEligibleForTargetedFill({
      path: "values.cuisine",
      key: "cuisine",
      kind: "text",
      value: "French",
      aiMeta: meta({
        confidenceByPath: {
          "values.cuisine": { confidence: "VERIFIED", sourceNote: "Video" },
        },
      }),
      allowRepopulate: true,
    }),
    false,
  );
  assert.equal(
    isFieldEligibleForTargetedFill({
      path: "values.cuisine",
      key: "cuisine",
      kind: "text",
      value: "French",
      allowRepopulate: true,
    }),
    true,
  );
});
