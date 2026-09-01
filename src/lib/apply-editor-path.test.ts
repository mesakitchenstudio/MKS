import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyValueAtEditorPath,
  readCurrentEditorFieldValue,
  readValueAtEditorPath,
} from "./apply-editor-path";
import { extractTargetedFieldValue, mergeTargetedFillIntoEditor } from "./ai-recipe/targeted-merge";

const SAMPLE_VALUES = {
  instructions: [
    {
      name: "Initial Mix & Autolyse",
      steps: ["Mix flour and water", "Rest 30 minutes"],
      chapterLabel: "Mix",
      startTimestamp: 0,
      endTimestamp: 60,
    },
    {
      name: "Activate Yeast & Incorporate",
      steps: ["Add yeast", "Knead"],
      chapterLabel: "Yeast",
      startTimestamp: 60,
    },
    {
      name: "Shape & Bake",
      steps: ["Shape loaves"],
      startTimestamp: 300,
    },
  ],
  ingredients: [
    {
      name: "Dough",
      items: [
        { item: "warm water", amount: "290 ml", notes: "around 30°C" },
        { item: "flour", amount: "500 g", notes: "" },
      ],
    },
  ],
  faq: [
    { question: "Can I use cold water?", answer: "Room temperature works best." },
  ],
  keyIngredients: [{ name: "Bread flour", explanation: "Higher protein for structure." }],
};

function assertScalarCurrentValue(path: string, expected: unknown) {
  const current = readCurrentEditorFieldValue({
    path,
    title: "Baguette",
    excerpt: "Crispy crust.",
    categoryIds: ["cat-breads"],
    values: SAMPLE_VALUES,
  });
  assert.equal(typeof current === "object" && current !== null && !Array.isArray(current), false, `${path} must be scalar`);
  assert.deepEqual(current, expected);
}

test("readCurrentEditorFieldValue reads instruction section title at nested path", () => {
  assertScalarCurrentValue("values.instructions.1.name", "Activate Yeast & Incorporate");
  assert.notEqual(
    readCurrentEditorFieldValue({
      path: "values.instructions.1.name",
      values: SAMPLE_VALUES,
    }),
    SAMPLE_VALUES.instructions,
  );
});

test("readCurrentEditorFieldValue audits granular PR1 scalar fields", () => {
  assertScalarCurrentValue("values.instructions.1.name", "Activate Yeast & Incorporate");
  assertScalarCurrentValue("values.instructions.0.steps.0", "Mix flour and water");
  assertScalarCurrentValue("values.ingredients.0.name", "Dough");
  assertScalarCurrentValue("values.ingredients.0.items.0.amount", "290 ml");
  assertScalarCurrentValue("values.ingredients.0.items.0.item", "warm water");
  assertScalarCurrentValue("values.ingredients.0.items.0.notes", "around 30°C");
  assertScalarCurrentValue("values.faq.0.question", "Can I use cold water?");
  assertScalarCurrentValue("values.faq.0.answer", "Room temperature works best.");
  assertScalarCurrentValue("values.keyIngredients.0.name", "Bread flour");
  assertScalarCurrentValue("values.keyIngredients.0.explanation", "Higher protein for structure.");
  assertScalarCurrentValue("values.instructions.1.chapterLabel", "Yeast");
});

test("mergeTargetedFillIntoEditor applies only instruction section title at index 1", () => {
  const path = "values.instructions.1.name";
  const currentValue = readCurrentEditorFieldValue({
    path,
    values: SAMPLE_VALUES,
  });
  assert.equal(currentValue, "Activate Yeast & Incorporate");

  const result = mergeTargetedFillIntoEditor({
    current: {
      title: "Baguette",
      slug: "baguette",
      excerpt: "",
      categoryIds: [],
      values: structuredClone(SAMPLE_VALUES),
    },
    draft: {
      excerpt: "",
      values: {
        instructions: [
          { name: "SHOULD NOT APPLY", steps: ["x"] },
          { name: "Improved Yeast Section", steps: ["y"] },
          { name: "Shape & Bake", steps: ["z"] },
        ],
      },
    },
    requestedPaths: [path],
    confidenceByPath: {
      [path]: { confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Targeted AI fill" },
    },
    aiMeta: null,
  });

  const instructions = result.values.instructions as typeof SAMPLE_VALUES.instructions;
  assert.equal(instructions[1]?.name, "Improved Yeast Section");
  assert.equal(instructions[0]?.name, "Initial Mix & Autolyse");
  assert.deepEqual(instructions[0]?.steps, ["Mix flour and water", "Rest 30 minutes"]);
  assert.equal(instructions[1]?.chapterLabel, "Yeast");
  assert.equal(instructions[1]?.startTimestamp, 60);
  assert.deepEqual(instructions[1]?.steps, ["Add yeast", "Knead"]);
  assert.equal(instructions[2]?.name, "Shape & Bake");
});

test("extractTargetedFieldValue returns scalar suggestion for nested path", () => {
  const suggestion = extractTargetedFieldValue({
    path: "values.instructions.1.name",
    draft: {
      excerpt: "",
      values: {
        instructions: [{ name: "x" }, { name: "Better Title" }],
      },
    },
  });
  assert.equal(suggestion, "Better Title");
  assert.equal(typeof suggestion, "string");
});

test("applyValueAtEditorPath mutates only the requested nested segment", () => {
  const next = applyValueAtEditorPath(structuredClone(SAMPLE_VALUES), "values.instructions.1.name", "New Name");
  const instructions = next.instructions as typeof SAMPLE_VALUES.instructions;
  assert.equal(instructions[1]?.name, "New Name");
  assert.equal(instructions[0]?.name, "Initial Mix & Autolyse");
  assert.equal(instructions[2]?.name, "Shape & Bake");
});

test("readValueAtEditorPath does not fall back to parent instructions array", () => {
  const value = readValueAtEditorPath(SAMPLE_VALUES, "values.instructions.1.name");
  assert.equal(value, "Activate Yeast & Incorporate");
  assert.notDeepEqual(value, SAMPLE_VALUES.instructions);
});
