import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fieldValueHasContent,
  formatPublicExtraFieldValue,
  isHoursDurationField,
  nutritionHasPublicContent,
} from "./field-content";

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

test("hours duration fields are detected by kind or *Hours key convention", () => {
  assert.equal(isHoursDurationField("riseHours", "number"), true);
  assert.equal(isHoursDurationField("chillHours", "number"), true);
  assert.equal(isHoursDurationField("fermentationHours", "number"), true);
  assert.equal(isHoursDurationField("servings", "number"), false);
  assert.equal(isHoursDurationField("riseHours", "hours"), true);
});

test("formatPublicExtraFieldValue formats decimal hours like the timing card", () => {
  assert.equal(
    formatPublicExtraFieldValue({ key: "riseHours", kind: "number", value: 4.5 }),
    "4 h 30 min",
  );
  assert.equal(
    formatPublicExtraFieldValue({ key: "riseHours", kind: "number", value: 5 }),
    "5 h",
  );
  assert.equal(
    formatPublicExtraFieldValue({ key: "riseHours", kind: "number", value: 1.25 }),
    "1 h 15 min",
  );
  assert.equal(
    formatPublicExtraFieldValue({ key: "riseHours", kind: "number", value: 0.5 }),
    "30 min",
  );
  assert.equal(
    formatPublicExtraFieldValue({ key: "chillHours", kind: "number", value: 2 }),
    "2 h",
  );
});

test("formatPublicExtraFieldValue formats minutes kind fields", () => {
  assert.equal(
    formatPublicExtraFieldValue({ key: "customRest", kind: "minutes", value: 90 }),
    "1 h 30 min",
  );
});

test("formatPublicExtraFieldValue leaves non-duration numbers as-is", () => {
  assert.equal(
    formatPublicExtraFieldValue({ key: "batchCount", kind: "number", value: 12 }),
    "12",
  );
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
