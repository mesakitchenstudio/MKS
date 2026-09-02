import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fieldNeedsHumanReview,
  isFieldProtectedFromBulkAi,
  legacyConfidenceToSource,
  resolveActiveFieldAiAnnotation,
  resolveActiveFieldSource,
  resolveFieldSource,
  resolveFieldSourceDisplayLabel,
} from "./ai-recipe/field-state";
import { evaluateRecipeFields } from "./recipe-editor-field-state";
import { applyValueAtEditorPath, readValueAtEditorPath } from "./apply-editor-path";
import { validateStaffVerification } from "./recipe-staff-verify";

test("legacy UNKNOWN maps to undefined source", () => {
  assert.equal(legacyConfidenceToSource("UNKNOWN"), undefined);
});

test("legacy VERIFIED maps to from_video", () => {
  assert.equal(legacyConfidenceToSource("VERIFIED"), "from_video");
});

test("edited field is protected from bulk AI", () => {
  const meta = {
    generatedByAI: true,
    sourceType: "youtube" as const,
    sourceUrl: "",
    generatedAt: "",
    model: "",
    schemaVersion: "",
    verificationStatus: "unverified" as const,
    confidenceByPath: {},
    summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
    fieldProvenance: {
      "values.intro": {
        aiGenerated: true,
        aiGeneratedValue: "Old",
        humanModifiedAfterGeneration: true,
        reviewState: "edited" as const,
        source: "staff" as const,
        originalAi: { value: "Old", source: "from_video" as const },
      },
    },
  };
  assert.equal(isFieldProtectedFromBulkAi("values.intro", meta), true);
  assert.equal(resolveFieldSource("values.intro", meta), "staff");
});

test("FAQ question with empty answer counts as partial recommended missing", () => {
  const evaluation = evaluateRecipeFields({
    fields: [{ key: "faqs", label: "Frequently asked", kind: "namedNotes", required: false }],
    title: "Bread",
    excerpt: "",
    categoryIds: [],
    values: {
      faqs: [{ name: "Can I freeze this?", note: "" }],
    },
  });
  const partial = evaluation.nodes.find((node) => node.path.includes(".note"));
  assert.ok(partial);
  assert.equal(partial?.completeness, "partial");
  assert.equal(partial?.blocking, false);
  assert.equal(partial?.attentionLevel, "recommended");
});

test("required empty intro is blocking missing", () => {
  const evaluation = evaluateRecipeFields({
    fields: [{ key: "intro", label: "Introduction", kind: "textarea", required: true }],
    title: "Bread",
    excerpt: "",
    categoryIds: [],
    values: { intro: "" },
  });
  assert.equal(evaluation.counts.blockingMissing, 1);
});

test("optional empty holiday is ai-fillable but not blocking", () => {
  const evaluation = evaluateRecipeFields({
    fields: [{ key: "holiday", label: "Season / holiday", kind: "text", required: false }],
    title: "Bread",
    excerpt: "",
    categoryIds: [],
    values: { holiday: "" },
    typeFields: [{ key: "holiday", label: "Season / holiday", kind: "text", required: false, helpText: "", options: [] }],
  });
  assert.equal(evaluation.counts.blockingMissing, 0);
  assert.ok(evaluation.counts.aiFillableEmpty >= 1);
});

test("cleared AI field hides stale inferred source and review count", () => {
  const meta = {
    generatedByAI: true,
    sourceType: "youtube" as const,
    sourceUrl: "",
    generatedAt: "",
    model: "",
    schemaVersion: "",
    verificationStatus: "unverified" as const,
    confidenceByPath: {
      "values.holiday": {
        confidence: "HIGH_CONFIDENCE_INFERENCE" as const,
        sourceNote: "Targeted AI fill",
      },
    },
    summary: { verified: 0, inferred: 1, estimated: 0, unknown: 0 },
    fieldProvenance: {
      "values.holiday": {
        aiGenerated: true,
        aiGeneratedValue: "Christmas",
        humanModifiedAfterGeneration: true,
        reviewState: "edited" as const,
        source: "staff" as const,
        originalAi: { value: "Christmas", source: "inferred" as const },
      },
    },
  };
  assert.equal(resolveActiveFieldSource("values.holiday", meta, true), undefined);
  assert.deepEqual(resolveActiveFieldAiAnnotation("values.holiday", meta, true), {});
  const evaluation = evaluateRecipeFields({
    fields: [{ key: "holiday", label: "Season / holiday", kind: "text", required: false }],
    title: "Bread",
    excerpt: "",
    categoryIds: [],
    values: { holiday: "" },
    aiMeta: meta,
    typeFields: [{ key: "holiday", label: "Season / holiday", kind: "text", required: false, helpText: "", options: [] }],
  });
  const holidayNode = evaluation.nodes.find((node) => node.path === "values.holiday");
  assert.ok(holidayNode);
  assert.equal(holidayNode?.completeness, "missing");
  assert.equal(holidayNode?.needsReview, false);
  assert.equal(holidayNode?.source, undefined);
  assert.equal(holidayNode?.aiFillEligible, true);
  assert.equal(evaluation.counts.needsReview, 0);
});

test("applyValueAtEditorPath updates nested instruction step", () => {
  const values = {
    instructions: [{ name: "Mix", steps: ["Combine flour", ""] }],
  };
  const next = applyValueAtEditorPath(values, "values.instructions.0.steps.1", "Knead until smooth");
  assert.equal(readValueAtEditorPath(next, "values.instructions.0.steps.1"), "Knead until smooth");
});

test("confirmed populated AI content with confirmed reviewState does not need review", () => {
  const meta = {
    generatedByAI: true,
    sourceType: "youtube" as const,
    sourceUrl: "",
    generatedAt: "",
    model: "",
    schemaVersion: "",
    verificationStatus: "unverified" as const,
    confidenceByPath: {
      "values.intro": { confidence: "HIGH_CONFIDENCE_INFERENCE" as const, sourceNote: "AI" },
    },
    summary: { verified: 0, inferred: 1, estimated: 0, unknown: 0 },
    fieldProvenance: {
      "values.intro": {
        aiGenerated: true,
        aiGeneratedValue: "Warm intro",
        humanModifiedAfterGeneration: false,
        reviewState: "confirmed" as const,
        source: "inferred" as const,
      },
    },
  };
  assert.equal(
    fieldNeedsHumanReview({ path: "values.intro", meta, isEmpty: false }),
    false,
  );
});

test("staff verification blocked when required fields missing", () => {
  const result = validateStaffVerification({
    title: "Bread",
    excerpt: "",
    categoryIds: [],
    values: { intro: "" },
    fields: [{ key: "intro", label: "Introduction", kind: "textarea", required: true, helpText: "", options: [] }],
    aiMeta: null,
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockingMissing > 0);
});

test("needsReview is false for edited staff fields", () => {
  const meta = {
    generatedByAI: true,
    sourceType: "youtube" as const,
    sourceUrl: "",
    generatedAt: "",
    model: "",
    schemaVersion: "",
    verificationStatus: "unverified" as const,
    confidenceByPath: {},
    summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
    fieldProvenance: {
      "values.intro": {
        aiGenerated: true,
        aiGeneratedValue: "Staff copy",
        humanModifiedAfterGeneration: true,
        reviewState: "edited" as const,
        source: "staff" as const,
      },
    },
  };
  assert.equal(
    fieldNeedsHumanReview({ path: "values.intro", meta, isEmpty: false }),
    false,
  );
});

test("needsReview is true for unreviewed inferred AI content", () => {
  const meta = {
    generatedByAI: true,
    sourceType: "youtube" as const,
    sourceUrl: "",
    generatedAt: "",
    model: "",
    schemaVersion: "",
    verificationStatus: "unverified" as const,
    confidenceByPath: {
      "values.intro": { confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Targeted AI fill" },
    },
    summary: { verified: 0, inferred: 1, estimated: 0, unknown: 0 },
    fieldProvenance: {
      "values.intro": {
        aiGenerated: true,
        aiGeneratedValue: "AI intro",
        humanModifiedAfterGeneration: false,
        reviewState: "unreviewed" as const,
        source: "inferred" as const,
      },
    },
  };
  assert.equal(
    fieldNeedsHumanReview({ path: "values.intro", meta, isEmpty: false }),
    true,
  );
});

test("nutrition source is never from_video", () => {
  const meta = {
    generatedByAI: true,
    sourceType: "youtube" as const,
    sourceUrl: "",
    generatedAt: "",
    model: "",
    schemaVersion: "",
    verificationStatus: "unverified" as const,
    confidenceByPath: {
      "values.nutrition": { confidence: "VERIFIED", sourceNote: "From video" },
    },
    summary: { verified: 1, inferred: 0, estimated: 0, unknown: 0 },
  };
  assert.equal(resolveFieldSource("values.nutrition", meta), "inferred");
});

test("applyValueAtEditorPath updates nested ingredient amount", () => {
  const values = {
    ingredients: [{ name: "Dough", items: [{ item: "warm water", amount: "", notes: "30°C" }] }],
  };
  const next = applyValueAtEditorPath(values, "values.ingredients.0.items.0.amount", "290 ml");
  assert.equal(readValueAtEditorPath(next, "values.ingredients.0.items.0.amount"), "290 ml");
  assert.equal(readValueAtEditorPath(next, "values.ingredients.0.items.0.item"), "warm water");
});

test("confirmed AI video timestamps display as AI video analysis not YouTube import", () => {
  const meta = {
    generatedByAI: true,
    verificationStatus: "unverified" as const,
    fieldProvenance: {
      "values.instructions.0.startTimestamp": {
        aiGenerated: true,
        aiGeneratedValue: 67,
        humanModifiedAfterGeneration: false,
        reviewState: "confirmed" as const,
        source: "from_video" as const,
        originalAi: { value: 67, source: "inferred" as const },
      },
    },
  };
  assert.equal(
    resolveFieldSourceDisplayLabel("values.instructions.0.startTimestamp", meta),
    "AI video analysis (confirmed)",
  );
  assert.equal(resolveFieldSourceDisplayLabel("values.instructions.0.startTimestamp", {
    ...meta,
    fieldProvenance: {
      "values.instructions.0.startTimestamp": {
        aiGenerated: true,
        aiGeneratedValue: 0,
        humanModifiedAfterGeneration: false,
        reviewState: "confirmed" as const,
        source: "from_video" as const,
        originalAi: { value: 0, source: "from_video" as const },
      },
    },
  }), "From video");
});
