import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canReplaceFieldOnRegenerate,
  mergeYoutubeMetadataValues,
  noteHumanEditorChange,
  shouldApplyDraftField,
} from "./field-tracking";
import type { RecipeAiMeta } from "./types";

const baseMeta: RecipeAiMeta = {
  generatedByAI: true,
  sourceType: "youtube",
  sourceUrl: "https://www.youtube.com/watch?v=abc",
  sourceVideoId: "abc",
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
      humanModifiedAfterGeneration: false,
    },
  },
};

test("noteHumanEditorChange marks AI field when value diverges", () => {
  const next = noteHumanEditorChange(baseMeta, "values.prepMinutes", 30);
  assert.equal(next?.fieldProvenance?.["values.prepMinutes"]?.humanModifiedAfterGeneration, true);
});

test("noteHumanEditorChange ignores unchanged AI value", () => {
  const next = noteHumanEditorChange(baseMeta, "values.prepMinutes", 20);
  assert.equal(next?.fieldProvenance?.["values.prepMinutes"]?.humanModifiedAfterGeneration, false);
});

test("replace_previous_ai skips human-modified AI fields", () => {
  const meta: RecipeAiMeta = {
    ...baseMeta,
    fieldProvenance: {
      "values.prepMinutes": {
        aiGenerated: true,
        aiGeneratedValue: 20,
        humanModifiedAfterGeneration: true,
      },
    },
  };
  assert.equal(canReplaceFieldOnRegenerate("values.prepMinutes", meta), false);
  assert.equal(
    shouldApplyDraftField({
      path: "values.prepMinutes",
      mode: "replace_previous_ai",
      meta,
      isEmpty: false,
    }),
    false,
  );
});

test("replace_previous_ai allows humanModified empty placeholder fields", () => {
  const meta: RecipeAiMeta = {
    ...baseMeta,
    fieldProvenance: {
      "values.ingredients": {
        aiGenerated: true,
        aiGeneratedValue: [{ name: "", items: [] }],
        humanModifiedAfterGeneration: true,
      },
    },
  };
  assert.equal(canReplaceFieldOnRegenerate("values.ingredients", meta, true), true);
  assert.equal(
    shouldApplyDraftField({
      path: "values.ingredients",
      mode: "replace_previous_ai",
      meta,
      isEmpty: true,
    }),
    true,
  );
});

test("noteHumanEditorChange ignores blank ingredient template reshaping", () => {
  const meta: RecipeAiMeta = {
    ...baseMeta,
    fieldProvenance: {
      "values.ingredients": {
        aiGenerated: true,
        aiGeneratedValue: [
          { name: "", items: [] },
          { name: "", items: [] },
        ],
        humanModifiedAfterGeneration: false,
      },
    },
  };
  const next = noteHumanEditorChange(meta, "values.ingredients", [
    { name: "", items: [{ item: "", amount: "", notes: "" }] },
  ]);
  assert.equal(next?.fieldProvenance?.["values.ingredients"]?.humanModifiedAfterGeneration, false);
});

test("noteHumanEditorChange strips stale confidence when staff clears scalar field", () => {
  const meta: RecipeAiMeta = {
    ...baseMeta,
    confidenceByPath: {
      "values.holiday": {
        confidence: "HIGH_CONFIDENCE_INFERENCE",
        sourceNote: "Targeted AI fill",
      },
    },
    summary: { verified: 0, inferred: 1, estimated: 0, unknown: 0 },
    fieldProvenance: {
      "values.holiday": {
        aiGenerated: true,
        aiGeneratedValue: "Christmas",
        humanModifiedAfterGeneration: false,
        reviewState: "unreviewed",
        source: "inferred",
      },
    },
  };
  const next = noteHumanEditorChange(meta, "values.holiday", "");
  assert.equal(next?.confidenceByPath?.["values.holiday"], undefined);
  assert.equal(next?.summary.inferred, 0);
  assert.equal(next?.fieldProvenance?.["values.holiday"]?.humanModifiedAfterGeneration, true);
  assert.equal(next?.fieldProvenance?.["values.holiday"]?.originalAi?.value, "Christmas");
});

test("replace_previous_ai skips verified recipe fields", () => {
  const meta: RecipeAiMeta = {
    ...baseMeta,
    verificationStatus: "verified",
  };
  assert.equal(canReplaceFieldOnRegenerate("values.prepMinutes", meta), false);
});

test("replace_all_ai_fillable does not wipe existing YouTube chapters with empty Gemini draft", () => {
  const current = {
    duration: "7:39",
    timestamps: [
      { time: 0, label: "Intro" },
      { time: 42, label: "Mix" },
    ],
  };
  const draft = { duration: "7:39" };
  const merged = mergeYoutubeMetadataValues({
    current,
    draft,
    mode: "replace_all_ai_fillable",
    meta: baseMeta,
  });
  const timestamps = (merged?.timestamps as { label?: string }[] | undefined) ?? [];
  assert.equal(timestamps.length, 2);
  assert.equal(timestamps[0]?.label, "Intro");
});
