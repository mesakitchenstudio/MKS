import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countRecipesMissingFieldContent,
  countRecipesWithFieldContent,
  fieldKindUsesOptions,
  fieldValueHasContent,
  isCoreFieldKey,
  partitionTypeFields,
} from "./field-admin";
import { keyFromLabel } from "./fields";

test("isCoreFieldKey identifies shared schema keys", () => {
  assert.equal(isCoreFieldKey("image"), true);
  assert.equal(isCoreFieldKey("intro"), true);
  assert.equal(isCoreFieldKey("ingredients"), true);
  assert.equal(isCoreFieldKey("youtubeUrl"), true);
  assert.equal(isCoreFieldKey("dressingNotes"), false);
});

test("keyFromLabel generates camelCase keys", () => {
  assert.equal(keyFromLabel("Cake height"), "cakeHeight");
  assert.equal(keyFromLabel("Frosting notes"), "frostingNotes");
});

test("fieldKindUsesOptions is true only for select", () => {
  assert.equal(fieldKindUsesOptions("select"), true);
  assert.equal(fieldKindUsesOptions("text"), false);
  assert.equal(fieldKindUsesOptions("ingredients"), false);
});

test("partitionTypeFields preserves sortOrder within each group", () => {
  const fields = [
    {
      id: "1",
      key: "a",
      label: "A",
      helpText: "",
      kind: "text",
      required: false,
      options: [],
      sortOrder: 20,
      isShared: false,
      globalIndex: 2,
    },
    {
      id: "2",
      key: "b",
      label: "B",
      helpText: "",
      kind: "text",
      required: false,
      options: [],
      sortOrder: 8,
      isShared: false,
      globalIndex: 1,
    },
    {
      id: "3",
      key: "c",
      label: "C",
      helpText: "",
      kind: "text",
      required: false,
      options: [],
      sortOrder: 0,
      isShared: true,
      globalIndex: 0,
    },
  ];
  const { typeSpecific, shared } = partitionTypeFields(fields);
  assert.equal(typeSpecific.length, 2);
  assert.equal(typeSpecific[0]?.key, "b");
  assert.equal(typeSpecific[1]?.key, "a");
  assert.equal(shared.length, 1);
  assert.equal(shared[0]?.key, "c");
});

test("fieldValueHasContent detects stored recipe values by kind", () => {
  assert.equal(fieldValueHasContent("hello", "text"), true);
  assert.equal(fieldValueHasContent("", "text"), false);
  assert.equal(fieldValueHasContent(["tag"], "tags"), true);
  assert.equal(fieldValueHasContent([""], "tags"), false);
  assert.equal(fieldValueHasContent(0, "minutes"), false);
  assert.equal(fieldValueHasContent(15, "minutes"), true);
  assert.equal(fieldValueHasContent({ calories: 0, carbs: 0, protein: 0, fat: 0 }, "nutrition"), false);
  assert.equal(fieldValueHasContent({ calories: 100, carbs: 0, protein: 0, fat: 0 }, "nutrition"), true);
});

test("countRecipesWithFieldContent counts recipes by key", () => {
  const recipes = [
    { values: JSON.stringify({ intro: "Hello" }) },
    { values: JSON.stringify({ intro: "" }) },
    { values: JSON.stringify({ intro: "Again" }) },
  ];
  assert.equal(countRecipesWithFieldContent(recipes, "intro", "textarea"), 2);
  assert.equal(countRecipesMissingFieldContent(recipes, "intro", "textarea"), 1);
});
