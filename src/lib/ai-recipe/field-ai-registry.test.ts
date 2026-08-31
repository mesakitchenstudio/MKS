import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRecipeAiFieldRegistry,
  buildTargetedFieldContext,
  dedupeSuggestedTags,
  fieldPathHasContent,
  getRecipeFieldAiDef,
  isRecipeFieldAiSupported,
  normalizeFieldAiResponse,
  recipeFieldIsEmpty,
  resolveFieldAiActionLabel,
} from "./field-ai-registry";
import { isFieldEligibleForTargetedFill, listMissingAiFillableFields } from "./missing-fields";
import { mergeTargetedFillIntoEditor } from "./targeted-merge";
import type { RecipeAiMeta } from "./types";
import type { SchemaField } from "./schema-version";

const typeFields: SchemaField[] = [
  { key: "cuisine", label: "Cuisine", kind: "text", required: false },
  { key: "holiday", label: "Season / holiday", kind: "text", required: false },
  { key: "nutrition", label: "Nutrition", kind: "nutrition", required: false },
  { key: "riseHours", label: "Rise hours", kind: "number", required: false },
  { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
  { key: "instructions", label: "Instructions", kind: "instructions", required: true },
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
    summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
    ...partial,
  };
}

test("buildRecipeAiFieldRegistry includes title, nutrition, and type-specific fields", () => {
  const registry = buildRecipeAiFieldRegistry(typeFields);
  assert.equal(registry.get("title")?.strategy, "gemini_semantic");
  assert.equal(registry.get("values.nutrition")?.strategy, "gemini_nutrition");
  assert.equal(registry.get("values.riseHours")?.strategy, "gemini_numeric");
  assert.equal(registry.get("values.ingredients")?.strategy, "none");
  assert.equal(registry.get("values.image")?.strategy, "source_owned");
});

test("isRecipeFieldAiSupported covers details and excludes source-owned fields", () => {
  assert.equal(isRecipeFieldAiSupported("title", typeFields), true);
  assert.equal(isRecipeFieldAiSupported("values.holiday", typeFields), true);
  assert.equal(isRecipeFieldAiSupported("values.nutrition", typeFields), true);
  assert.equal(isRecipeFieldAiSupported("values.riseHours", typeFields), true);
  assert.equal(isRecipeFieldAiSupported("values.image", typeFields), false);
  assert.equal(isRecipeFieldAiSupported("values.ingredients", typeFields), false);
});

test("recipeFieldIsEmpty treats zero nutrition as empty", () => {
  assert.equal(
    recipeFieldIsEmpty({
      path: "values.nutrition",
      kind: "nutrition",
      value: { calories: 0, carbs: 0, protein: 0, fat: 0 },
    }),
    true,
  );
  assert.equal(
    recipeFieldIsEmpty({
      path: "values.nutrition",
      kind: "nutrition",
      value: { calories: 220, carbs: 40, protein: 6, fat: 2 },
    }),
    false,
  );
});

test("normalizeFieldAiResponse parses nutrition per serving", () => {
  const parsed = normalizeFieldAiResponse({
    path: "values.nutrition",
    raw: { calories: 210.4, carbs: 42, protein: 7, fat: 1.2 },
    def: getRecipeFieldAiDef("values.nutrition", typeFields),
  });
  assert.deepEqual(parsed, { calories: 210, carbs: 42, protein: 7, fat: 1 });
});

test("isFieldEligibleForTargetedFill allows cleared verified fields", () => {
  assert.equal(
    isFieldEligibleForTargetedFill({
      path: "values.holiday",
      key: "holiday",
      kind: "text",
      value: "",
      aiMeta: meta({
        confidenceByPath: {
          "values.holiday": { confidence: "VERIFIED", sourceNote: "Video" },
        },
      }),
      allowRepopulate: true,
    }),
    true,
  );
});

test("listMissingAiFillableFields includes title and nutrition from registry", () => {
  const result = listMissingAiFillableFields({
    fields: typeFields,
    title: "",
    slug: "baguette",
    excerpt: "Crispy crust",
    categoryIds: [],
    values: {
      holiday: "",
      cuisine: "French",
      nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
      ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
      instructions: [{ name: "Mix", steps: ["Combine"] }],
      image: "https://example.com/hero.jpg",
    },
    aiMeta: meta(),
  });
  const paths = result.missing.map((row) => row.path);
  assert.ok(paths.includes("title"));
  assert.ok(paths.includes("values.holiday"));
  assert.ok(paths.includes("values.nutrition"));
});

test("mergeTargetedFillIntoEditor updates title without changing slug", () => {
  const result = mergeTargetedFillIntoEditor({
    current: {
      title: "",
      slug: "artisan-french-baguettes",
      excerpt: "Short",
      categoryIds: [],
      values: {},
    },
    draft: {
      title: "Artisan French Baguettes with a Crisp Golden Crust",
      excerpt: "Short",
      values: {},
    },
    requestedPaths: ["title"],
    confidenceByPath: {
      title: { confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Targeted AI fill" },
    },
    aiMeta: meta(),
  });
  assert.equal(result.title, "Artisan French Baguettes with a Crisp Golden Crust");
  assert.equal(result.excerpt, "Short");
});

test("resolveFieldAiActionLabel uses nutrition and title labels", () => {
  assert.equal(
    resolveFieldAiActionLabel({ path: "title", hasContent: false }),
    "✦ Generate title",
  );
  assert.equal(
    resolveFieldAiActionLabel({ kind: "nutrition", strategy: "gemini_nutrition", hasContent: false }),
    "✦ Estimate nutrition",
  );
});

test("dedupeSuggestedTags removes near duplicates and caps count", () => {
  const tags = dedupeSuggestedTags([
    "bread",
    "bread recipe",
    "baguette",
    "French bread",
  ]);
  assert.ok(tags.length <= 12);
  assert.ok(tags.includes("bread") || tags.includes("baguette"));
});

test("buildTargetedFieldContext for title excludes copying YouTube title", () => {
  const context = buildTargetedFieldContext({
    path: "title",
    current: {
      title: "",
      excerpt: "",
      values: {
        intro: "Crispy baguette",
        ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g" }] }],
        instructions: [{ name: "Mix", steps: ["Combine"] }],
      },
    },
    videoContext: {
      linkedVideoId: "abc",
      schemaVersion: "v1",
      model: "test",
      dishContext: "Why Your Homemade Bread Isn't Crusty",
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  assert.match(String(context.taskNote ?? ""), /Do NOT copy the YouTube video title/i);
  assert.ok(Array.isArray(context.ingredients));
});
