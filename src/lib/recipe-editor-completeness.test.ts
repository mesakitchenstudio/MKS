import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listMissingRequiredFields,
  missingRequiredKeys,
  publishErrorKeys,
  validateRecipeForPublish,
} from "./recipe-editor-completeness";
import type { EditorFieldShape } from "./recipe-editor-completeness";

const fields: EditorFieldShape[] = [
  { key: "intro", label: "Introduction", kind: "textarea", required: true },
  { key: "whyItWorks", label: "Why this works", kind: "textarea", required: false },
  { key: "notes", label: "Notes", kind: "list", required: false },
  { key: "tips", label: "Studio tips", kind: "list", required: false },
  { key: "faqs", label: "Frequently asked", kind: "namedNotes", required: false },
  { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
  { key: "instructions", label: "Instructions", kind: "instructions", required: true },
  { key: "cuisine", label: "Cuisine", kind: "text", required: false },
  { key: "holiday", label: "Season / holiday", kind: "text", required: false },
  { key: "imageAlt", label: "Image description", kind: "text", required: true },
];

const populatedContentValues = {
  intro: "Achieve bakery-quality French baguettes at home.",
  whyItWorks: "Steam and high heat create a crisp crust.",
  notes: [],
  tips: [],
  faqs: [{ name: "", note: "" }],
  ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
  instructions: [{ name: "Mix", steps: ["Combine ingredients"] }],
  cuisine: "French",
  holiday: "Year-round",
  imageAlt: "Golden baguettes on a rack",
};

test("populated intro and whyItWorks do not count as missing in Content", () => {
  const missing = listMissingRequiredFields({
    fields,
    title: "Bakery-Style French Baguettes",
    values: populatedContentValues,
  });
  const contentMissing = missing.filter((row) => row.section === "content");
  assert.equal(contentMissing.length, 0);
});

test("optional empty notes tips faqs do not increase missing count", () => {
  const missing = listMissingRequiredFields({
    fields,
    title: "Bread",
    values: {
      ...populatedContentValues,
      notes: [],
      tips: [],
      faqs: [],
    },
  });
  assert.ok(!missing.some((row) => row.key === "notes"));
  assert.ok(!missing.some((row) => row.key === "tips"));
  assert.ok(!missing.some((row) => row.key === "faqs"));
  assert.ok(!missing.some((row) => row.key === "whyItWorks"));
});

test("clearing required intro increases content missing by one", () => {
  const missing = listMissingRequiredFields({
    fields,
    title: "Bread",
    values: { ...populatedContentValues, intro: "" },
  });
  assert.deepEqual(
    missing.filter((row) => row.section === "content").map((row) => row.key),
    ["intro"],
  );
});

test("empty title counts as missing in basics", () => {
  const missing = listMissingRequiredFields({
    fields,
    title: "",
    values: populatedContentValues,
  });
  assert.ok(missing.some((row) => row.key === "title"));
});

test("tab completeness keys match publish validation required-field keys", () => {
  const input = {
    fields,
    title: "Bread",
    values: {
      ...populatedContentValues,
      intro: "",
      ingredients: [{ name: "", items: [{ item: "", amount: "", notes: "" }] }],
    },
  };
  const missing = missingRequiredKeys(listMissingRequiredFields(input)).sort();
  const publish = publishErrorKeys(input).sort();
  assert.deepEqual(missing, publish);
});

test("baguette-style recipe with required content populated shows zero content missing", () => {
  const coreRequiredFields: EditorFieldShape[] = [
    { key: "difficulty", label: "Difficulty", kind: "select", required: true },
    { key: "prepMinutes", label: "Preparation time", kind: "minutes", required: true },
    { key: "servings", label: "Servings", kind: "number", required: true },
    { key: "intro", label: "Introduction", kind: "textarea", required: true },
    { key: "whyItWorks", label: "Why this works", kind: "textarea", required: false },
    { key: "notes", label: "Notes", kind: "list", required: false },
    { key: "tips", label: "Studio tips", kind: "list", required: false },
    { key: "faqs", label: "Frequently asked", kind: "namedNotes", required: false },
    { key: "keyIngredients", label: "Key ingredients", kind: "namedNotes", required: false },
    { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
    { key: "instructions", label: "Instructions", kind: "instructions", required: true },
    { key: "image", label: "Hero image", kind: "image", required: true },
    { key: "imageAlt", label: "Image description", kind: "text", required: true },
  ];
  const missing = listMissingRequiredFields({
    fields: coreRequiredFields,
    title: "Bakery-Style French Baguettes",
    values: {
      difficulty: "Medium",
      prepMinutes: 30,
      servings: 4,
      intro: "Achieve bakery-quality French baguettes at home.",
      whyItWorks: "Steam and high heat create a crisp crust.",
      notes: [],
      tips: [],
      faqs: [],
      keyIngredients: [],
      ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
      instructions: [{ name: "Mix", steps: ["Combine ingredients"] }],
      image: "/uploads/baguette.jpg",
      imageAlt: "Golden baguettes on a rack",
    },
  });
  assert.equal(missing.filter((row) => row.section === "content").length, 0);
  assert.equal(missing.filter((row) => row.section === "details").length, 0);
});

test("validateRecipeForPublish returns errors aligned with missing required fields", () => {
  const errors = validateRecipeForPublish({
    fields,
    title: "",
    values: { ...populatedContentValues, intro: "" },
  });
  assert.ok(errors.title);
  assert.ok(errors.intro);
  assert.equal(errors.notes, undefined);
  assert.equal(errors.whyItWorks, undefined);
});
