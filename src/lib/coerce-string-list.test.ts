import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceStringList,
  coerceStringListItem,
  isPlainStringListKind,
  isStringListCorruptSentinel,
  STRING_LIST_CORRUPT_SENTINEL,
} from "./coerce-string-list.ts";
import { fieldAiResponseSchemaHint, normalizeFieldAiResponse } from "./ai-recipe/field-ai-registry.ts";
import { normalizeAiRecipeResponse } from "./ai-recipe/normalize.ts";
import { toPublicRecipe } from "./recipe-map.ts";

describe("coerceStringList", () => {
  it("passes through clean string arrays and trims empties", () => {
    assert.deepEqual(coerceStringList([" whisk ", "", "bowl"]), ["whisk", "bowl"]);
    assert.deepEqual(coerceStringList(null), []);
    assert.deepEqual(coerceStringList(undefined), []);
  });

  it("recovers supported AI object shapes and drops unsupported objects", () => {
    assert.equal(coerceStringListItem({ name: "whisk" }), "whisk");
    assert.equal(coerceStringListItem({ text: "bowl" }), "bowl");
    assert.equal(coerceStringListItem({ value: "spatula" }), "spatula");
    assert.equal(coerceStringListItem({ note: "large bowl" }), "large bowl");
    assert.equal(coerceStringListItem({ name: "knife", note: "chef" }), "knife: chef");
    assert.equal(coerceStringListItem({ foo: "bar" }), null);
    assert.deepEqual(
      coerceStringList([{ name: "whisk" }, { unsupported: true }, "bowl"]),
      ["whisk", "bowl"],
    );
  });

  it("excludes the exact [object Object] sentinel and never creates it", () => {
    assert.equal(isStringListCorruptSentinel(STRING_LIST_CORRUPT_SENTINEL), true);
    assert.equal(isStringListCorruptSentinel("object lesson"), false);
    assert.deepEqual(coerceStringList([STRING_LIST_CORRUPT_SENTINEL, "whisk"]), ["whisk"]);
    assert.equal(coerceStringListItem({}), null);
    assert.ok(!coerceStringList([{ a: 1 }]).includes(STRING_LIST_CORRUPT_SENTINEL));
  });

  it("identifies plain string-list kinds only", () => {
    assert.equal(isPlainStringListKind("list"), true);
    assert.equal(isPlainStringListKind("tags"), true);
    assert.equal(isPlainStringListKind("gallery"), true);
    assert.equal(isPlainStringListKind("namedNotes"), false);
    assert.equal(isPlainStringListKind("ingredients"), false);
  });
});

describe("AI plain-list normalization", () => {
  it("never returns [object Object] for list fields from object-shaped AI output", () => {
    const draft = normalizeAiRecipeResponse({
      raw: {
        title: { value: "Test loaf", confidence: "VERIFIED", sourceNote: "From video" },
        utensils: {
          value: [{ name: "mixing bowl", note: "large" }, { name: "whisk" }],
          confidence: "HIGH_CONFIDENCE_INFERENCE",
          sourceNote: "Inferred",
        },
        tips: {
          value: [{ text: "Toast deeply" }, "[object Object]"],
          confidence: "HIGH_CONFIDENCE_INFERENCE",
          sourceNote: "Inferred",
        },
        notes: {
          value: [{ foo: "bar" }, "Make dressing ahead"],
          confidence: "HIGH_CONFIDENCE_INFERENCE",
          sourceNote: "Inferred",
        },
      },
      typeId: "type-1",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      fields: [
        { key: "utensils", kind: "list", label: "Utensils", required: false },
        { key: "tips", kind: "list", label: "Studio tips", required: false },
        { key: "notes", kind: "list", label: "Notes", required: false },
      ],
      allowedCategoryIds: new Set(),
      allowedTypeIds: new Set(["type-1"]),
    });

    assert.deepEqual(draft.values.utensils, ["mixing bowl: large", "whisk"]);
    assert.deepEqual(draft.values.tips, ["Toast deeply"]);
    assert.deepEqual(draft.values.notes, ["Make dressing ahead"]);
    assert.ok(!JSON.stringify(draft.values).includes(STRING_LIST_CORRUPT_SENTINEL));
  });

  it("requests plain strings for gemini_list hints", () => {
    const hint = fieldAiResponseSchemaHint(
      {
        path: "values.utensils",
        key: "utensils",
        label: "Utensils",
        kind: "list",
        strategy: "gemini_list",
        section: "details",
        confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
        requiresPreviewWhenPopulated: true,
      },
      "values.utensils",
    );
    assert.match(hint, /plain strings/i);
    assert.doesNotMatch(hint, /"name".*"note"/);
  });

  it("keeps namedNotes object shape for FAQs", () => {
    const hint = fieldAiResponseSchemaHint(
      {
        path: "values.faqs",
        key: "faqs",
        label: "FAQ",
        kind: "namedNotes",
        strategy: "gemini_named_notes",
        section: "content",
        confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
        requiresPreviewWhenPopulated: true,
      },
      "values.faqs",
    );
    assert.match(hint, /name.*note/);

    const normalized = normalizeFieldAiResponse({
      path: "values.utensils",
      raw: { value: [{ name: "bowl" }, { weird: true }] },
      def: {
        path: "values.utensils",
        key: "utensils",
        label: "Utensils",
        kind: "list",
        strategy: "gemini_list",
        section: "details",
        confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
        requiresPreviewWhenPopulated: true,
      },
    });
    assert.deepEqual(normalized, ["bowl"]);
  });
});

describe("public string-list mapping", () => {
  it("suppresses corrupt sentinels and recovers recoverable objects", () => {
    const recipe = toPublicRecipe({
      slug: "test",
      title: "Test",
      excerpt: "",
      featured: false,
      seasonal: false,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      values: {
        utensils: ["[object Object]", { name: "whisk" }, "bowl"],
        tips: ["[object Object]", "Tip one"],
        notes: [{ note: "Ahead" }, "[object Object]"],
        intro: "Hello",
        ingredients: [{ name: "", items: [{ item: "flour", amount: "1c", notes: "" }] }],
        instructions: [{ name: "", steps: ["Mix"] }],
        nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
        servings: 4,
        servingsUnit: "servings",
        course: "",
        method: "",
        cuisine: "",
        tags: [],
        image: "",
        imageAlt: "",
        prepMinutes: 10,
        cookMinutes: 0,
      },
      categories: [],
    });

    assert.deepEqual(recipe.utensils, ["whisk", "bowl"]);
    assert.deepEqual(recipe.tips, ["Tip one"]);
    assert.deepEqual(recipe.notes, ["Ahead"]);
    assert.ok(!JSON.stringify(recipe).includes(STRING_LIST_CORRUPT_SENTINEL));
  });
});

describe("editor hydrate/save list integrity", () => {
  it("hydrating object-shaped lists then re-encoding never persists the sentinel", () => {
    const fields = [
      { key: "utensils", kind: "list" },
      { key: "notes", kind: "list" },
      { key: "tips", kind: "list" },
      { key: "faqs", kind: "namedNotes" },
    ];
    const raw = {
      utensils: [{ name: "bowl" }, "[object Object]"],
      notes: [{ foo: 1 }, "Keep cold"],
      tips: [{ text: "Toast" }],
      faqs: [{ name: "Q", note: "A" }],
    };

    const hydrated: Record<string, unknown> = {};
    for (const field of fields) {
      hydrated[field.key] = isPlainStringListKind(field.kind)
        ? coerceStringList(raw[field.key as keyof typeof raw])
        : raw[field.key as keyof typeof raw];
    }

    assert.deepEqual(hydrated.utensils, ["bowl"]);
    assert.deepEqual(hydrated.notes, ["Keep cold"]);
    assert.deepEqual(hydrated.tips, ["Toast"]);
    assert.deepEqual(hydrated.faqs, [{ name: "Q", note: "A" }]);

    // Simulate unrelated edit + save boundary re-encode.
    const encoded: Record<string, string> = {};
    for (const field of fields) {
      encoded[field.key] = JSON.stringify(
        isPlainStringListKind(field.kind) ? coerceStringList(hydrated[field.key]) : hydrated[field.key],
      );
    }
    assert.equal(encoded.utensils, JSON.stringify(["bowl"]));
    assert.equal(encoded.notes, JSON.stringify(["Keep cold"]));
    assert.equal(encoded.tips, JSON.stringify(["Toast"]));
    assert.equal(encoded.faqs, JSON.stringify([{ name: "Q", note: "A" }]));
    assert.ok(!Object.values(encoded).some((value) => value.includes(STRING_LIST_CORRUPT_SENTINEL)));
  });
});
