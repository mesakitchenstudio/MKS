import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTargetedFieldContext,
  dedupeSuggestedTags,
  fieldPathHasContent,
  isFieldAiPath,
  normalizeFieldAiResponse,
  resolveFieldAiActionLabel,
} from "./field-ai-registry";

test("isFieldAiPath allowlists supported paths and rejects protected fields", () => {
  assert.equal(isFieldAiPath("values.whyItWorks"), true);
  assert.equal(isFieldAiPath("values.ingredients"), false);
  assert.equal(isFieldAiPath("categoryIds"), true);
});

test("resolveFieldAiActionLabel distinguishes empty, improve, and categories", () => {
  assert.equal(resolveFieldAiActionLabel({ hasContent: false }), "✦ Generate");
  assert.equal(resolveFieldAiActionLabel({ hasContent: true }), "✦ Improve");
  assert.equal(resolveFieldAiActionLabel({ hasContent: true, intent: "alternative" }), "✦ Try another");
  assert.equal(
    resolveFieldAiActionLabel({ path: "categoryIds", hasContent: false }),
    "✦ Suggest categories",
  );
  assert.equal(
    resolveFieldAiActionLabel({ path: "categoryIds", hasContent: true }),
    "✦ Review categories",
  );
});

test("fieldPathHasContent treats empty categories as empty", () => {
  assert.equal(fieldPathHasContent({ path: "categoryIds", value: [], categoryIds: [] }), false);
  assert.equal(
    fieldPathHasContent({ path: "categoryIds", value: ["a"], categoryIds: ["a"] }),
    true,
  );
});

test("dedupeSuggestedTags removes near duplicates and caps count", () => {
  const tags = dedupeSuggestedTags([
    "bread",
    "bread recipe",
    "homemade bread",
    "baguette",
    "French bread",
    "artisan bread",
    "crispy crust",
    "yeast bread",
    "easy bread",
    "simple bread",
    "best bread",
    "bread tutorial",
    "extra tag",
  ]);
  assert.ok(tags.length <= 12);
  assert.ok(!tags.some((tag) => tag.toLowerCase() === "bread recipe"));
});

test("normalizeFieldAiResponse restricts categories to taxonomy ids", () => {
  const allowed = new Set(["cat-1", "cat-2"]);
  assert.deepEqual(
    normalizeFieldAiResponse({
      path: "categoryIds",
      raw: { categoryIds: ["cat-1", "cat-x", "cat-2"] },
      allowedCategoryIds: allowed,
    }),
    ["cat-1", "cat-2"],
  );
  assert.equal(
    normalizeFieldAiResponse({
      path: "categoryIds",
      raw: { categoryIds: ["cat-x"] },
      allowedCategoryIds: allowed,
    }),
    null,
  );
});

test("buildTargetedFieldContext includes taxonomy for category suggestions", () => {
  const context = buildTargetedFieldContext({
    path: "categoryIds",
    current: {
      title: "Baguette",
      excerpt: "",
      categoryIds: [],
      values: { intro: "Crispy crust", method: "Bake", ingredients: [] },
    },
    categories: [
      { id: "cat-breads", name: "Breads", slug: "breads", group: "type" },
      { id: "cat-oven", name: "Oven", slug: "oven", group: "method" },
    ],
  });
  assert.ok(Array.isArray(context.taxonomy));
  assert.equal((context.taxonomy as { id: string }[]).length, 2);
  assert.equal(context.title, "Baguette");
});

test("buildTargetedFieldContext for whyItWorks includes ingredients and method", () => {
  const context = buildTargetedFieldContext({
    path: "values.whyItWorks",
    current: {
      title: "Baguette",
      excerpt: "Short",
      values: {
        method: "Bake",
        intro: "Intro text",
        ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g" }] }],
        instructions: [{ name: "Mix", steps: ["Combine"] }],
      },
    },
  });
  assert.equal(context.method, "Bake");
  assert.ok(Array.isArray(context.ingredients));
  assert.ok(Array.isArray(context.instructions));
});
