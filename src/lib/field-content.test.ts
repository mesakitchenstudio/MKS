import assert from "node:assert/strict";
import { test } from "node:test";
import { fieldValueHasContent, nutritionHasPublicContent } from "./field-content";

test("number/minutes treat 0 as not provided, non-zero as content", () => {
  assert.equal(fieldValueHasContent(0, "number"), false);
  assert.equal(fieldValueHasContent(0, "minutes"), false);
  assert.equal(fieldValueHasContent(null, "number"), false);
  assert.equal(fieldValueHasContent(undefined, "minutes"), false);
  assert.equal(fieldValueHasContent(2, "number"), true);
  assert.equal(fieldValueHasContent(2, "minutes"), true);
});

test("text-like fields hide blank and whitespace", () => {
  assert.equal(fieldValueHasContent("", "text"), false);
  assert.equal(fieldValueHasContent("   ", "textarea"), false);
  assert.equal(fieldValueHasContent("rise", "text"), true);
});

test("lists hide empty and blank-only entries", () => {
  assert.equal(fieldValueHasContent([], "list"), false);
  assert.equal(fieldValueHasContent(["", "  "], "tags"), false);
  assert.equal(fieldValueHasContent(["oil"], "list"), true);
});

test("nutrition hides all-default zeros and shows any meaningful value", () => {
  assert.equal(
    nutritionHasPublicContent({ calories: 0, carbs: 0, protein: 0, fat: 0 }),
    false,
  );
  assert.equal(fieldValueHasContent({ calories: 0, carbs: 0, protein: 0, fat: 0 }, "nutrition"), false);
  assert.equal(nutritionHasPublicContent({ calories: 186, carbs: 0, protein: 0, fat: 0 }), true);
  assert.equal(nutritionHasPublicContent({ calories: 22, carbs: 4, protein: 1, fat: 0 }), true);
  assert.equal(nutritionHasPublicContent({ calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 3 }), true);
});
