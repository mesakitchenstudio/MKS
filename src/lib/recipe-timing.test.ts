import assert from "node:assert/strict";
import { test } from "node:test";
import {
  heatTimingRing,
  countedHeatMinutes,
  totalMinutes,
} from "./recipe-utils";
import {
  publicRestLabel,
  publicRestMinutes,
  shouldHideRiseHoursExtra,
} from "./recipe-timing";
import type { Recipe } from "@/data/types";

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

test("countedHeatMinutes avoids double-counting legacy synced rows", () => {
  assert.equal(countedHeatMinutes(baseRecipe({ bakeMinutes: 50, cookMinutes: 50 })), 50);
  assert.equal(countedHeatMinutes(baseRecipe({ bakeMinutes: 0, cookMinutes: 15 })), 15);
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
