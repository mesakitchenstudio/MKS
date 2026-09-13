import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  heatTimingRing,
  heatTimingRings,
  countedHeatMinutes,
  totalMinutes,
  formatTime,
  isoDuration,
} from "./recipe-utils";
import {
  publicRestLabel,
  publicRestMinutes,
  shouldHideRiseHoursExtra,
} from "./recipe-timing";
import { recipePrintMetaItems } from "./recipe-print";
import { recipeJsonLd } from "./schema";
import type { Recipe } from "@/data/types";

const root = path.dirname(fileURLToPath(import.meta.url));

const baseRecipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  slug: "test",
  title: "Test",
  excerpt: "",
  intro: "",
  whyItWorks: "",
  keyIngredients: [],
  tips: [],
  faqs: [],
  image: "",
  imageAlt: "",
  publishedAt: "2026-01-01",
  updatedAt: "2026-01-01",
  prepMinutes: 20,
  cookMinutes: 0,
  bakeMinutes: 0,
  restMinutes: 0,
  servings: 4,
  servingsUnit: "servings",
  course: "Bread",
  method: "Stovetop",
  cuisine: "Middle Eastern",
  categories: [],
  tags: [],
  featured: false,
  seasonal: false,
  ingredients: [],
  instructions: [],
  notes: [],
  nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
  ...overrides,
});

test("heatTimingRing prefers baking when bakeMinutes is set", () => {
  const ring = heatTimingRing(baseRecipe({ bakeMinutes: 40, cookMinutes: 0 }));
  assert.deepEqual(ring, { minutes: 40, label: "Baking" });
});

test("heatTimingRing shows cooking for stovetop recipes", () => {
  const ring = heatTimingRing(baseRecipe({ bakeMinutes: 0, cookMinutes: 15 }));
  assert.deepEqual(ring, { minutes: 15, label: "Cooking" });
});

test("heatTimingRings exposes both Cooking and Baking when both contribute", () => {
  assert.deepEqual(
    heatTimingRings(baseRecipe({ prepMinutes: 30, cookMinutes: 15, bakeMinutes: 60 })),
    [
      { minutes: 15, label: "Cooking" },
      { minutes: 60, label: "Baking" },
    ],
  );
});

test("heatTimingRings hides Cooking when cook is 0", () => {
  assert.deepEqual(heatTimingRings(baseRecipe({ bakeMinutes: 60, cookMinutes: 0 })), [
    { minutes: 60, label: "Baking" },
  ]);
});

test("heatTimingRings shows Cooking only when bake is 0", () => {
  assert.deepEqual(heatTimingRings(baseRecipe({ bakeMinutes: 0, cookMinutes: 30 })), [
    { minutes: 30, label: "Cooking" },
  ]);
});

test("heatTimingRings uses single Baking for legacy mirrored bake/cook", () => {
  assert.deepEqual(
    heatTimingRings(baseRecipe({ bakeMinutes: 60, cookMinutes: 60 })),
    [{ minutes: 60, label: "Baking" }],
  );
});

test("countedHeatMinutes avoids double-counting legacy synced rows", () => {
  assert.equal(countedHeatMinutes(baseRecipe({ bakeMinutes: 50, cookMinutes: 50 })), 50);
  assert.equal(countedHeatMinutes(baseRecipe({ bakeMinutes: 60, cookMinutes: 60 })), 60);
  assert.equal(countedHeatMinutes(baseRecipe({ bakeMinutes: 0, cookMinutes: 15 })), 15);
});

test("countedHeatMinutes sums distinct bake and cook", () => {
  assert.equal(countedHeatMinutes(baseRecipe({ bakeMinutes: 60, cookMinutes: 15 })), 75);
});

test("totalMinutes prep + bake only", () => {
  assert.equal(
    totalMinutes(baseRecipe({ prepMinutes: 30, bakeMinutes: 60, cookMinutes: 0, restMinutes: 0 })),
    90,
  );
});

test("totalMinutes prep + cook + bake", () => {
  assert.equal(
    totalMinutes(baseRecipe({ prepMinutes: 30, cookMinutes: 15, bakeMinutes: 60, restMinutes: 0 })),
    105,
  );
});

test("totalMinutes after cook cleared to 0", () => {
  assert.equal(
    totalMinutes(baseRecipe({ prepMinutes: 30, cookMinutes: 0, bakeMinutes: 60, restMinutes: 0 })),
    90,
  );
});

test("totalMinutes includes prep, heat, and proofing rest", () => {
  const recipe = {
    ...baseRecipe({ prepMinutes: 20, bakeMinutes: 0, cookMinutes: 15, restMinutes: 0 }),
    extras: [{ key: "riseHours", label: "Proofing time", kind: "number", value: 1 }],
  };
  assert.equal(totalMinutes(recipe), 20 + 15 + 60);
});

test("rise and rest deduplication hides redundant rise extra", () => {
  const recipe = {
    ...baseRecipe({ restMinutes: 60 }),
    extras: [{ key: "riseHours", label: "Proofing time", kind: "number", value: 1 }],
  };
  assert.equal(shouldHideRiseHoursExtra(recipe), true);
  assert.equal(publicRestLabel(recipe), "Proofing");
  assert.equal(publicRestMinutes(recipe), 60);
});

test("publicRestMinutes sums proofing and separate bench rest when windows differ", () => {
  const recipe = {
    ...baseRecipe({ restMinutes: 75 }),
    extras: [{ key: "riseHours", label: "Proofing time", kind: "number", value: 8 }],
  };
  assert.equal(publicRestMinutes(recipe), 8 * 60 + 75);
  assert.equal(totalMinutes(recipe), 20 + 75 + 8 * 60);
});

test("print meta exposes Cooking and Baking when both contribute", () => {
  const meta = recipePrintMetaItems(
    baseRecipe({ prepMinutes: 30, cookMinutes: 15, bakeMinutes: 60, restMinutes: 0 }),
    4,
  );
  assert.deepEqual(
    meta.filter((item) => ["Prep", "Cooking", "Baking", "Total"].includes(item.label)),
    [
      { label: "Prep", value: formatTime(30) },
      { label: "Cooking", value: formatTime(15) },
      { label: "Baking", value: formatTime(60) },
      { label: "Total", value: formatTime(105) },
    ],
  );
});

test("print meta hides Cooking when cook is 0", () => {
  const meta = recipePrintMetaItems(
    baseRecipe({ prepMinutes: 30, cookMinutes: 0, bakeMinutes: 60 }),
    4,
  );
  assert.ok(!meta.some((item) => item.label === "Cooking"));
  assert.ok(meta.some((item) => item.label === "Baking"));
});

test("JSON-LD cookTime and totalTime agree with counted heat and total", () => {
  const recipe = baseRecipe({
    prepMinutes: 30,
    cookMinutes: 15,
    bakeMinutes: 60,
    restMinutes: 0,
  });
  const json = recipeJsonLd(recipe);
  assert.equal(json.cookTime, isoDuration(75));
  assert.equal(json.totalTime, isoDuration(105));
  assert.equal(json.prepTime, isoDuration(30));
  assert.equal(json.totalTime, isoDuration(totalMinutes(recipe)));
  assert.equal(json.cookTime, isoDuration(countedHeatMinutes(recipe)));
});

test("Admin Timing includes cookMinutes and glance uses heatTimingRings", () => {
  const editor = readFileSync(path.join(root, "../components/admin/RecipeEditor.tsx"), "utf8");
  assert.match(
    editor,
    /TIMING_KEYS = \["prepMinutes", "cookMinutes", "bakeMinutes", "restMinutes"\]/,
  );
  assert.match(editor, /prepMinutes[\s\S]*cookMinutes[\s\S]*bakeMinutes[\s\S]*restMinutes/);
  assert.match(editor, /hydrateEditorValues[\s\S]*field\.key === "cookMinutes"/);

  const glance = readFileSync(path.join(root, "../components/RecipeAtAGlanceFacts.tsx"), "utf8");
  assert.match(glance, /heatTimingRings/);
  assert.doesNotMatch(glance, /heatTimingRing\(/);

  const preview = readFileSync(path.join(root, "../lib/recipe-admin-preview-server.ts"), "utf8");
  assert.match(preview, /toPublicRecipe/);
});
