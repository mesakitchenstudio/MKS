import assert from "node:assert/strict";
import { test } from "node:test";
import {
  editorHasContent,
  mergeAiDraftIntoEditor,
  normalizeAiRecipeResponse,
} from "./normalize";
import { checkAiGenerateRateLimit, resetAiGenerateRateLimitsForTests } from "./rate-limit";
import { computeRecipeSchemaVersion } from "./schema-version";

const fields = [
  { key: "intro", label: "Introduction", kind: "textarea", required: true },
  { key: "prepMinutes", label: "Prep", kind: "minutes", required: true },
  { key: "youtubeUrl", label: "YouTube", kind: "text", required: false },
  { key: "image", label: "Hero", kind: "image", required: true },
  { key: "riseHours", label: "Rise hours", kind: "number", required: false },
];

test("normalize rejects unknown categories and forces featured/seasonal false", () => {
  const draft = normalizeAiRecipeResponse({
    raw: {
      recipeTypeId: "type-1",
      title: { value: "Flatbread", confidence: "VERIFIED", sourceNote: "spoken" },
      slug: { value: "flatbread", confidence: "ESTIMATED", sourceNote: "from title" },
      excerpt: { value: "Soft flatbread", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "tone" },
      featured: { value: true, confidence: "ESTIMATED", sourceNote: "no" },
      seasonal: { value: true, confidence: "ESTIMATED", sourceNote: "no" },
      categoryIds: {
        value: ["cat-ok", "cat-fake"],
        confidence: "VERIFIED",
        sourceNote: "taxonomy",
      },
      fields: {
        intro: { value: "Hello", confidence: "VERIFIED", sourceNote: "spoken" },
        prepMinutes: { value: 20, confidence: "VERIFIED", sourceNote: "spoken" },
        youtubeUrl: { value: "https://example.com", confidence: "UNKNOWN", sourceNote: "" },
        riseHours: { value: 0, confidence: "UNKNOWN", sourceNote: "" },
      },
      insufficientRecipeInformation: false,
      insufficientReason: "",
    },
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    fields,
    allowedCategoryIds: new Set(["cat-ok"]),
    allowedTypeIds: new Set(["type-1"]),
  });

  assert.equal(draft.featured, false);
  assert.equal(draft.seasonal, false);
  assert.deepEqual(draft.categoryIds, ["cat-ok"]);
  assert.equal(draft.values.youtubeUrl, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(draft.values.image, "");
  assert.equal(draft.confidenceByPath.title?.confidence, "VERIFIED");
});

test("fill_empty merge keeps manual title", () => {
  const draft = normalizeAiRecipeResponse({
    raw: {
      recipeTypeId: "type-1",
      title: { value: "AI Title", confidence: "VERIFIED", sourceNote: "" },
      slug: { value: "ai-title", confidence: "ESTIMATED", sourceNote: "" },
      excerpt: { value: "AI excerpt", confidence: "ESTIMATED", sourceNote: "" },
      featured: { value: false, confidence: "VERIFIED", sourceNote: "" },
      seasonal: { value: false, confidence: "VERIFIED", sourceNote: "" },
      categoryIds: { value: [], confidence: "UNKNOWN", sourceNote: "" },
      fields: {
        intro: { value: "AI intro", confidence: "VERIFIED", sourceNote: "" },
        prepMinutes: { value: 15, confidence: "ESTIMATED", sourceNote: "" },
      },
      insufficientRecipeInformation: false,
      insufficientReason: "",
    },
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });

  const merged = mergeAiDraftIntoEditor(
    {
      title: "Manual Title",
      slug: "",
      excerpt: "",
      featured: false,
      seasonal: false,
      categoryIds: [],
      values: { intro: "", prepMinutes: 0, youtubeUrl: "", image: "", riseHours: 0 },
    },
    draft,
    fields,
    "fill_empty",
  );

  assert.equal(merged.title, "Manual Title");
  assert.equal(merged.values.intro, "AI intro");
  assert.equal(merged.slug, "ai-title");
});

test("editorHasContent detects typed title", () => {
  assert.equal(
    editorHasContent({
      title: "Hello",
      excerpt: "",
      categoryIds: [],
      values: {},
      fields,
    }),
    true,
  );
  assert.equal(
    editorHasContent({
      title: "",
      excerpt: "",
      categoryIds: [],
      values: { intro: "" },
      fields,
    }),
    false,
  );
});

test("schema version changes when fields change", () => {
  const a = computeRecipeSchemaVersion({
    coreFieldKeys: ["intro"],
    types: [{ id: "t1", name: "Bread", slug: "bread", fields: [{ key: "riseHours", label: "Rise", kind: "number", required: false }] }],
    categories: [{ id: "c1", name: "Breads", slug: "breads", group: "course" }],
  });
  const b = computeRecipeSchemaVersion({
    coreFieldKeys: ["intro"],
    types: [{ id: "t1", name: "Bread", slug: "bread", fields: [{ key: "riseHours", label: "Rise", kind: "minutes", required: false }] }],
    categories: [{ id: "c1", name: "Breads", slug: "breads", group: "course" }],
  });
  assert.notEqual(a, b);
});

test("AI generate rate limit blocks after max", () => {
  resetAiGenerateRateLimitsForTests();
  for (let i = 0; i < 8; i += 1) {
    const result = checkAiGenerateRateLimit({ adminId: "admin-a", ip: "1.1.1.1" });
    assert.equal(result.ok, true);
  }
  const blocked = checkAiGenerateRateLimit({ adminId: "admin-a", ip: "1.1.1.1" });
  assert.equal(blocked.ok, false);
});
