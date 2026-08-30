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
  { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
  { key: "instructions", label: "Instructions", kind: "instructions", required: true },
  { key: "youtubeUrl", label: "YouTube", kind: "text", required: false },
  { key: "image", label: "Hero", kind: "image", required: true },
  { key: "imageAlt", label: "Image description", kind: "text", required: true },
  { key: "riseHours", label: "Rise hours", kind: "number", required: false },
];

const sampleImageAlt =
  "A serving plate loaded with warm, golden-brown banana oatmeal cookies studded with mini chocolate chips.";

function baseAiRaw(fieldBag: Record<string, unknown>) {
  return {
    recipeTypeId: "type-1",
    title: { value: "Cookies", confidence: "VERIFIED" as const, sourceNote: "" },
    slug: { value: "cookies", confidence: "ESTIMATED" as const, sourceNote: "" },
    excerpt: { value: "Warm cookies", confidence: "HIGH_CONFIDENCE_INFERENCE" as const, sourceNote: "" },
    featured: { value: false, confidence: "VERIFIED" as const, sourceNote: "" },
    seasonal: { value: false, confidence: "VERIFIED" as const, sourceNote: "" },
    categoryIds: { value: [], confidence: "UNKNOWN" as const, sourceNote: "" },
    ...fieldBag,
    insufficientRecipeInformation: false,
    insufficientReason: "",
  };
}

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

test("normalize accepts unwrapped flat field values from prompt-json fallback", () => {
  const draft = normalizeAiRecipeResponse({
    raw: {
      recipeTypeId: "type-1",
      title: "Flatbread",
      slug: "flatbread",
      excerpt: "Soft stovetop flatbread",
      featured: false,
      seasonal: false,
      categoryIds: ["cat-ok"],
      fields: {
        intro: "A soft flatbread made on the stovetop.",
        prepMinutes: 20,
        ingredients: [
          {
            name: "",
            items: [{ amount: "2 cups", item: "flour", notes: "", confidence: "VERIFIED", sourceNote: "spoken" }],
          },
        ],
        instructions: [
          {
            name: "",
            steps: [{ text: "Mix the dough.", confidence: "VERIFIED", sourceNote: "shown" }],
          },
        ],
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

  assert.equal(draft.title, "Flatbread");
  assert.equal(draft.values.intro, "A soft flatbread made on the stovetop.");
  assert.equal(draft.values.prepMinutes, 20);
  assert.match(String((draft.values.ingredients as { items: { item: string }[] }[])[0]?.items[0]?.item), /flour/);
});

test("normalize promotes root-level field keys into fields bag", () => {
  const draft = normalizeAiRecipeResponse({
    raw: {
      recipeTypeId: "type-1",
      title: { value: "Flatbread", confidence: "VERIFIED", sourceNote: "" },
      slug: { value: "flatbread", confidence: "ESTIMATED", sourceNote: "" },
      excerpt: { value: "Soft flatbread", confidence: "ESTIMATED", sourceNote: "" },
      featured: { value: false, confidence: "VERIFIED", sourceNote: "" },
      seasonal: { value: false, confidence: "VERIFIED", sourceNote: "" },
      categoryIds: { value: [], confidence: "UNKNOWN", sourceNote: "" },
      intro: "Root-level intro should still map.",
      fields: {
        prepMinutes: { value: 15, confidence: "VERIFIED", sourceNote: "" },
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

  assert.equal(draft.values.intro, "Root-level intro should still map.");
});

test("AI draft imageAlt under values bag maps into normalized draft", () => {
  const draft = normalizeAiRecipeResponse({
    raw: baseAiRaw({
      values: {
        imageAlt: {
          value: sampleImageAlt,
          confidence: "HIGH_CONFIDENCE_INFERENCE",
          sourceNote: "visible plating",
        },
        intro: { value: "Hello", confidence: "VERIFIED", sourceNote: "" },
      },
    }),
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });

  assert.equal(draft.values.imageAlt, sampleImageAlt);
  assert.equal(draft.confidenceByPath["values.imageAlt"]?.confidence, "HIGH_CONFIDENCE_INFERENCE");
  assert.notEqual(draft.confidenceByPath["values.imageAlt"]?.confidence, "UNKNOWN");
});

test("AI draft contains imageAlt + empty form → alt text populated", () => {
  const draft = normalizeAiRecipeResponse({
    raw: baseAiRaw({
      fields: {
        intro: { value: "Hello", confidence: "VERIFIED", sourceNote: "" },
        imageAlt: {
          value: sampleImageAlt,
          confidence: "HIGH_CONFIDENCE_INFERENCE",
          sourceNote: "visible plating",
        },
      },
    }),
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });

  const merged = mergeAiDraftIntoEditor(
    {
      title: "",
      slug: "",
      excerpt: "",
      featured: false,
      seasonal: false,
      categoryIds: [],
      values: { intro: "", image: "", imageAlt: "", prepMinutes: 0, youtubeUrl: "", riseHours: 0 },
    },
    draft,
    fields,
    "fill_empty",
  );

  assert.equal(merged.values.imageAlt, sampleImageAlt);
  assert.ok(merged.appliedPaths.includes("values.imageAlt"));
  assert.equal(merged.fieldProvenance?.["values.imageAlt"]?.aiGenerated, true);
  assert.equal(merged.confidenceByPath["values.imageAlt"]?.confidence, "HIGH_CONFIDENCE_INFERENCE");
  // Publishing validation: required imageAlt is satisfied when populated.
  assert.ok(String(merged.values.imageAlt ?? "").trim().length > 0);
});

test("Regenerate + empty alt → AI alt populated; manual alt preserved", () => {
  const draft = normalizeAiRecipeResponse({
    raw: baseAiRaw({
      fields: {
        intro: { value: "Hello", confidence: "VERIFIED", sourceNote: "" },
        imageAlt: {
          value: sampleImageAlt,
          confidence: "HIGH_CONFIDENCE_INFERENCE",
          sourceNote: "",
        },
      },
    }),
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });

  const emptyAlt = mergeAiDraftIntoEditor(
    {
      title: "Cookies",
      slug: "cookies",
      excerpt: "",
      featured: false,
      seasonal: false,
      categoryIds: [],
      values: { intro: "Keep", image: "", imageAlt: "", prepMinutes: 10, youtubeUrl: "", riseHours: 0 },
    },
    draft,
    fields,
    "fill_empty",
  );
  assert.equal(emptyAlt.values.imageAlt, sampleImageAlt);

  const manual = "Editor-written alt text for accessibility.";
  const preserved = mergeAiDraftIntoEditor(
    {
      title: "Cookies",
      slug: "cookies",
      excerpt: "",
      featured: false,
      seasonal: false,
      categoryIds: [],
      values: {
        intro: "Keep",
        image: "",
        imageAlt: manual,
        prepMinutes: 10,
        youtubeUrl: "",
        riseHours: 0,
      },
    },
    draft,
    fields,
    "fill_empty",
  );
  assert.equal(preserved.values.imageAlt, manual);

  const replaceAll = mergeAiDraftIntoEditor(
    {
      title: "Cookies",
      slug: "cookies",
      excerpt: "",
      featured: false,
      seasonal: false,
      categoryIds: [],
      values: {
        intro: "Keep",
        image: "",
        imageAlt: "Previous AI alt",
        prepMinutes: 10,
        youtubeUrl: "",
        riseHours: 0,
      },
    },
    draft,
    fields,
    "replace_all_ai_fillable",
  );
  assert.equal(replaceAll.values.imageAlt, sampleImageAlt);
});

test("fill_empty does not replace populated imageAlt", () => {
  const draft = normalizeAiRecipeResponse({
    raw: baseAiRaw({
      fields: {
        intro: { value: "Hello", confidence: "VERIFIED", sourceNote: "" },
        imageAlt: {
          value: sampleImageAlt,
          confidence: "HIGH_CONFIDENCE_INFERENCE",
          sourceNote: "",
        },
      },
    }),
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });

  const existing = "Already filled alt from a prior draft.";
  const merged = mergeAiDraftIntoEditor(
    {
      title: "Cookies",
      slug: "cookies",
      excerpt: "",
      featured: false,
      seasonal: false,
      categoryIds: [],
      values: {
        intro: "Intro",
        image: "",
        imageAlt: existing,
        prepMinutes: 10,
        youtubeUrl: "",
        riseHours: 0,
      },
    },
    draft,
    fields,
    "fill_empty",
  );
  assert.equal(merged.values.imageAlt, existing);
});

test("truly empty imageAlt remains invalid for publishing", () => {
  assert.equal(String("").trim().length > 0, false);
  const draft = normalizeAiRecipeResponse({
    raw: baseAiRaw({
      fields: {
        intro: { value: "Hello", confidence: "VERIFIED", sourceNote: "" },
      },
    }),
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });
  assert.equal(String(draft.values.imageAlt ?? "").trim(), "");
  assert.equal(draft.confidenceByPath["values.imageAlt"]?.confidence, "UNKNOWN");
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

test("replace_previous_ai keeps human-edited AI field on regenerate", () => {
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
        prepMinutes: { value: 25, confidence: "VERIFIED", sourceNote: "" },
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

  const meta: import("./types").RecipeAiMeta = {
    generatedByAI: true,
    sourceType: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    sourceVideoId: "abcdefghijk",
    generatedAt: "2026-01-01T00:00:00.000Z",
    model: "gemini-test",
    schemaVersion: "v1",
    verificationStatus: "unverified",
    confidenceByPath: {},
    summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
    fieldProvenance: {
      "values.prepMinutes": {
        aiGenerated: true,
        aiGeneratedValue: 20,
        humanModifiedAfterGeneration: true,
      },
      "values.intro": {
        aiGenerated: true,
        aiGeneratedValue: "",
        humanModifiedAfterGeneration: false,
      },
    },
  };

  const merged = mergeAiDraftIntoEditor(
    {
      title: "Manual Title",
      slug: "manual-title",
      excerpt: "",
      featured: false,
      seasonal: false,
      categoryIds: [],
      values: { intro: "", prepMinutes: 30, youtubeUrl: "", image: "", riseHours: 0 },
    },
    draft,
    fields,
    "replace_previous_ai",
    meta,
  );

  assert.equal(merged.values.prepMinutes, 30);
  assert.equal(merged.values.intro, "AI intro");
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

test("flat Gemini ingredient lines survive normalization as one group", () => {
  const draft = normalizeAiRecipeResponse({
    raw: baseAiRaw({
      fields: {
        intro: { value: "Crusty bread tips", confidence: "VERIFIED", sourceNote: "spoken" },
        prepMinutes: { value: 20, confidence: "VERIFIED", sourceNote: "" },
        ingredients: {
          value: [
            { amount: "500 g", item: "Bread flour", notes: "", confidence: "VERIFIED", sourceNote: "overlay" },
            { amount: "290 ml", item: "Warm water", notes: "", confidence: "VERIFIED", sourceNote: "overlay" },
            { amount: "10 g", item: "Salt", notes: "", confidence: "VERIFIED", sourceNote: "overlay" },
            { amount: "4 g", item: "Active dry yeast", notes: "", confidence: "VERIFIED", sourceNote: "overlay" },
            { amount: "20 ml", item: "Warm water", notes: "for yeast", confidence: "VERIFIED", sourceNote: "overlay" },
          ],
          confidence: "VERIFIED",
          sourceNote: "Exact quantities displayed on video overlay.",
        },
        instructions: {
          value: [
            {
              name: "",
              steps: [{ text: "Mix 500g bread flour with 290ml warm water.", confidence: "VERIFIED", sourceNote: "" }],
            },
          ],
          confidence: "VERIFIED",
          sourceNote: "",
        },
      },
    }),
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=W_bykMwhJXk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });

  const groups = draft.values.ingredients as { name: string; items: { amount: string; item: string }[] }[];
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 5);
  assert.match(groups[0].items[0].item, /flour/i);
  assert.match(groups[0].items[0].amount, /500/);
  assert.equal(draft.confidenceByPath["values.ingredients"]?.confidence, "VERIFIED");
});

test("grouped ingredients and nested confident item wrappers survive", () => {
  const draft = normalizeAiRecipeResponse({
    raw: baseAiRaw({
      fields: {
        intro: { value: "Dough", confidence: "VERIFIED", sourceNote: "" },
        prepMinutes: { value: 10, confidence: "VERIFIED", sourceNote: "" },
        ingredients: {
          value: [
            {
              name: "Dough",
              items: [
                {
                  value: { amount: "500 g", item: "Bread flour", notes: "" },
                  confidence: "VERIFIED",
                  sourceNote: "overlay",
                },
                { quantity: "10 g", ingredient: "Salt", notes: "", confidence: "VERIFIED", sourceNote: "" },
              ],
            },
          ],
          confidence: "VERIFIED",
          sourceNote: "",
        },
        instructions: {
          value: [{ name: "", steps: [{ text: "Mix.", confidence: "VERIFIED", sourceNote: "" }] }],
          confidence: "VERIFIED",
          sourceNote: "",
        },
      },
    }),
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });

  const groups = draft.values.ingredients as { name: string; items: { amount: string; item: string }[] }[];
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "Dough");
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].items[0].item, "Bread flour");
  assert.equal(groups[0].items[1].item, "Salt");
});

test("blank placeholder ingredient groups are removed", () => {
  const draft = normalizeAiRecipeResponse({
    raw: baseAiRaw({
      fields: {
        intro: { value: "x", confidence: "VERIFIED", sourceNote: "" },
        prepMinutes: { value: 1, confidence: "VERIFIED", sourceNote: "" },
        ingredients: {
          value: [
            { name: "", items: [] },
            { name: "", items: [{ amount: "", item: "", notes: "" }] },
            { name: "Dough", items: [{ amount: "1 cup", item: "flour", notes: "" }] },
          ],
          confidence: "VERIFIED",
          sourceNote: "",
        },
        instructions: {
          value: [{ name: "", steps: [{ text: "Mix.", confidence: "VERIFIED", sourceNote: "" }] }],
          confidence: "VERIFIED",
          sourceNote: "",
        },
      },
    }),
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });

  const groups = draft.values.ingredients as { name: string; items: unknown[] }[];
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "Dough");
});

test("VERIFIED ingredients with zero rows are downgraded to UNKNOWN", () => {
  const draft = normalizeAiRecipeResponse({
    raw: baseAiRaw({
      fields: {
        intro: { value: "x", confidence: "VERIFIED", sourceNote: "" },
        prepMinutes: { value: 1, confidence: "VERIFIED", sourceNote: "" },
        ingredients: {
          value: [
            { name: "", items: [] },
            { name: "", items: [{ amount: "", item: "", notes: "" }] },
          ],
          confidence: "VERIFIED",
          sourceNote: "Exact quantities displayed on video overlay.",
        },
        instructions: {
          value: [{ name: "", steps: [{ text: "Mix.", confidence: "VERIFIED", sourceNote: "" }] }],
          confidence: "VERIFIED",
          sourceNote: "",
        },
      },
    }),
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });

  assert.deepEqual(draft.values.ingredients, []);
  assert.equal(draft.confidenceByPath["values.ingredients"]?.confidence, "UNKNOWN");
});

test("fill_empty merge persists normalized ingredients without blank group inflation", () => {
  const draft = normalizeAiRecipeResponse({
    raw: baseAiRaw({
      fields: {
        intro: { value: "Intro", confidence: "VERIFIED", sourceNote: "" },
        prepMinutes: { value: 15, confidence: "VERIFIED", sourceNote: "" },
        ingredients: {
          value: [
            { amount: "500 g", item: "Bread flour", notes: "" },
            { amount: "10 g", item: "Salt", notes: "" },
          ],
          confidence: "VERIFIED",
          sourceNote: "overlay",
        },
        instructions: {
          value: [{ name: "", steps: [{ text: "Mix flour and salt.", confidence: "VERIFIED", sourceNote: "" }] }],
          confidence: "VERIFIED",
          sourceNote: "",
        },
      },
    }),
    typeId: "type-1",
    youtubeUrl: "https://www.youtube.com/watch?v=W_bykMwhJXk",
    fields,
    allowedCategoryIds: new Set(),
    allowedTypeIds: new Set(["type-1"]),
  });

  const merged = mergeAiDraftIntoEditor(
    {
      title: "Why Your Homemade Bread Isn't Crusty",
      slug: "crusty",
      excerpt: "",
      featured: false,
      seasonal: false,
      categoryIds: [],
      values: {
        intro: "",
        prepMinutes: 0,
        ingredients: [
          { name: "", items: [] },
          { name: "", items: [] },
          { name: "", items: [{ item: "", amount: "", notes: "" }] },
        ],
        instructions: [{ name: "", steps: [""] }],
        youtubeUrl: "",
        image: "",
      },
    },
    draft,
    fields,
    "fill_empty",
  );

  const groups = merged.values.ingredients as { items: { item: string }[] }[];
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(merged.fieldProvenance?.["values.ingredients"]?.humanModifiedAfterGeneration, false);
  assert.equal(merged.fieldProvenance?.["values.ingredients"]?.aiGenerated, true);

  // Round-trip: re-merge with replace_previous_ai keeps populated ingredients
  const again = mergeAiDraftIntoEditor(
    {
      title: merged.title,
      slug: merged.slug,
      excerpt: merged.excerpt,
      featured: false,
      seasonal: false,
      categoryIds: [],
      values: merged.values,
    },
    draft,
    fields,
    "replace_previous_ai",
    {
      generatedByAI: true,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=W_bykMwhJXk",
      generatedAt: "2026-01-01T00:00:00.000Z",
      model: "test",
      schemaVersion: "v1",
      verificationStatus: "unverified",
      confidenceByPath: draft.confidenceByPath,
      summary: draft.summary,
      fieldProvenance: merged.fieldProvenance,
    },
  );
  assert.equal((again.values.ingredients as unknown[]).length, 1);
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
