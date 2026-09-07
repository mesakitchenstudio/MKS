import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCalendarReadinessInput,
  calendarScheduledReadinessFromCanonical,
} from "@/lib/content-calendar/readiness";
import {
  getRecipePublishingReadiness,
  publishingCheckIdForField,
} from "@/lib/recipe-publishing-readiness";
import { getRecipeContentHealth } from "@/lib/recipe-content-health";
import { decideScheduledRecipePublish } from "@/lib/recipe-schedule";

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const typeFields = [
  { key: "image", label: "Hero image", kind: "image", required: true, helpText: "", options: "[]" },
  { key: "imageAlt", label: "Image alt", kind: "text", required: true, helpText: "", options: "[]" },
  { key: "intro", label: "Intro", kind: "textarea", required: true, helpText: "", options: "[]" },
  {
    key: "ingredients",
    label: "Ingredients",
    kind: "ingredients",
    required: true,
    helpText: "",
    options: "[]",
  },
  {
    key: "instructions",
    label: "Instructions",
    kind: "instructions",
    required: true,
    helpText: "",
    options: "[]",
  },
  { key: "prepMinutes", label: "Prep", kind: "minutes", required: true, helpText: "", options: "[]" },
  { key: "servings", label: "Servings", kind: "number", required: true, helpText: "", options: "[]" },
  /** Custom required RecipeTypeField — Calendar must honor this. */
  {
    key: "customTechnique",
    label: "Technique note",
    kind: "text",
    required: true,
    helpText: "Required type field",
    options: "[]",
  },
];

const completeValues = {
  image: "https://example.public.blob.vercel-storage.com/baguette.jpg",
  imageAlt: "Baguettes",
  intro: "A classic loaf.",
  ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
  instructions: [{ title: "Mix", steps: ["Mix", "Bake"] }],
  prepMinutes: 20,
  servings: 4,
  customTechnique: "Prefer steam for the first 10 minutes.",
  youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
};

describe("phase 7C — Calendar readiness parity", () => {
  it("A. scheduled Recipe with all required fields → ready (Calendar matches canonical)", () => {
    const input = buildCalendarReadinessInput({
      title: "Ready Flatbread",
      slug: "ready-flatbread",
      excerpt: "Crispy edges.",
      typeId: "type-custom",
      values: completeValues,
      categoryIds: ["cat-1"],
      typeFields,
    });
    const direct = getRecipePublishingReadiness(input);
    const calendar = calendarScheduledReadinessFromCanonical(input);
    assert.equal(direct.status, "ready");
    assert.equal(calendar.status, direct.status);
    assert.equal(calendar.needsAttention, false);
    assert.deepEqual(calendar.failedCheckIds, []);
  });

  it("B. missing required RecipeTypeField → not_ready with matching check id", () => {
    const values = { ...completeValues, customTechnique: "" };
    const input = buildCalendarReadinessInput({
      title: "Almost Ready",
      slug: "almost-ready",
      excerpt: "Needs technique.",
      typeId: "type-custom",
      values,
      categoryIds: ["cat-1"],
      typeFields,
    });
    const direct = getRecipePublishingReadiness(input);
    const calendar = calendarScheduledReadinessFromCanonical(input);
    const expectedId = publishingCheckIdForField("customTechnique");

    assert.equal(direct.status, "not_ready");
    assert.equal(calendar.status, "not_ready");
    assert.equal(calendar.needsAttention, true);
    assert.ok(direct.required.some((check) => check.id === expectedId && !check.passed));
    assert.ok(calendar.failedCheckIds.includes(expectedId));
    assert.deepEqual(
      calendar.failedCheckIds,
      direct.required.filter((check) => !check.passed).map((check) => check.id),
    );

    const health = getRecipeContentHealth({
      recipeId: "r-b",
      title: "Almost Ready",
      slug: "almost-ready",
      publicationStatus: "draft",
      typeId: "type-custom",
      typeName: "Custom",
      updatedAt: new Date(),
      readinessInput: input,
    });
    assert.equal(health.health, "draft_not_ready");
    assert.equal(health.readinessStatus, "not_ready");

    const decision = decideScheduledRecipePublish({
      status: "draft",
      scheduledPublishAt: new Date("2020-01-01T00:00:00.000Z"),
      readinessStatus: calendar.status,
      now: new Date("2026-09-11T12:00:00.000Z"),
    });
    assert.equal(decision.action, "fail");
  });

  it("C. recommendation-only issue → ready_with_recommendations (not Needs attention)", () => {
    const values = { ...completeValues, youtubeUrl: "" };
    const input = buildCalendarReadinessInput({
      title: "Recommended Flatbread",
      slug: "recommended-flatbread",
      excerpt: "",
      typeId: "type-custom",
      values,
      categoryIds: [],
      typeFields,
    });
    const direct = getRecipePublishingReadiness(input);
    const calendar = calendarScheduledReadinessFromCanonical(input);
    assert.equal(direct.status, "ready_with_recommendations");
    assert.equal(calendar.status, "ready_with_recommendations");
    assert.equal(calendar.needsAttention, false);
  });

  it("D. missing title core blocker → not_ready parity", () => {
    const input = buildCalendarReadinessInput({
      title: "",
      slug: "no-title",
      excerpt: "x",
      typeId: "type-custom",
      values: completeValues,
      categoryIds: ["cat-1"],
      typeFields,
    });
    const direct = getRecipePublishingReadiness(input);
    const calendar = calendarScheduledReadinessFromCanonical(input);
    assert.equal(direct.status, "not_ready");
    assert.equal(calendar.status, "not_ready");
    assert.equal(calendar.needsAttention, true);
    assert.ok(calendar.failedCheckIds.includes("recipe.title"));
  });

  it("loads RecipeTypeField once in batch — not empty fields:[] and not per-item Prisma", () => {
    const load = readFileSync(path.join(srcRoot, "content-calendar/load.ts"), "utf8");
    assert.match(load, /loadTypeFieldsByTypeId/);
    assert.match(load, /recipeTypeField\.findMany/);
    assert.match(load, /typeId: \{ in: typeIds \}/);
    assert.match(load, /calendarScheduledReadinessFromCanonical/);
    assert.match(load, /buildCalendarReadinessInput/);
    assert.doesNotMatch(load, /fields:\s*\[\s*\]/);
    assert.doesNotMatch(
      load,
      /for \(const recipe of recipesScheduled\)[\s\S]{0,400}recipeTypeField\.findMany/,
    );

    const readiness = readFileSync(path.join(srcRoot, "content-calendar/readiness.ts"), "utf8");
    assert.match(readiness, /getRecipePublishingReadiness/);
    assert.doesNotMatch(readiness, /listMissingRequiredFields\(/);
  });
});
