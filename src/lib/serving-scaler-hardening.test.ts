import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Recipe } from "@/data/types";
import { scaleAmount } from "./culinary-format.ts";
import {
  cookingContentVersion,
  ingredientCheckKey,
} from "./cooking-session.ts";
import { alignStepTimers, minutesToTimerSeconds } from "./instruction-step.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

function fixtureRecipe(): Recipe {
  return {
    slug: "scaler-fixture",
    title: "Scaler Fixture",
    excerpt: "",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "/x.jpg",
    imageAlt: "",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-02",
    prepMinutes: 10,
    cookMinutes: 10,
    servings: 4,
    servingsUnit: "servings",
    course: "Bread",
    method: "Bake",
    cuisine: "French",
    categories: ["bread"],
    tags: [],
    ingredients: [
      {
        name: "Dough",
        items: [
          { item: "flour", amount: "1½ cups" },
          { item: "water", amount: "¾ cup" },
          { item: "yeast", amount: "1 to 2 teaspoons" },
          { item: "salt", amount: "to taste" },
          { item: "beans", amount: "1 can (15 ounces)" },
          { item: "oil", amount: "about 1 tablespoon" },
        ],
      },
    ],
    instructions: [
      {
        name: "Mix",
        steps: ["Combine.", "Rest."],
        stepTimers: [null, 600],
      },
    ],
    notes: [],
    nutrition: { calories: 100, carbs: 0, protein: 0, fat: 0 },
  };
}

describe("scaler UI consistency", () => {
  it("recipe page and Cooking Mode both import the canonical scaleAmount", () => {
    const card = read("components/RecipeCard.tsx");
    const cook = read("components/cooking/CookingIngredientsPanel.tsx");
    assert.match(card, /scaleAmount/);
    assert.match(cook, /scaleAmount/);
    assert.match(card, /from \"@\/lib\/culinary-format\"/);
    assert.match(cook, /from \"@\/lib\/culinary-format\"/);
    assert.doesNotMatch(card, /function scaleAmount/);
    assert.doesNotMatch(cook, /function scaleAmount/);
  });

  it("same recipe/servings produce identical scaled amounts", () => {
    const recipe = fixtureRecipe();
    const selected = 8;
    const factor = selected / recipe.servings;
    const fromRecipePage = recipe.ingredients[0]!.items.map((item) =>
      scaleAmount(item.amount, factor),
    );
    const fromCookingMode = recipe.ingredients[0]!.items.map((item) =>
      scaleAmount(item.amount, factor),
    );
    assert.deepEqual(fromRecipePage, fromCookingMode);
    assert.deepEqual(fromRecipePage, [
      "3 cups",
      "1½ cup",
      "2 to 4 teaspoons",
      "to taste",
      "2 can (15 ounces)",
      "about 2 tablespoon",
    ]);
  });

  it("scaling always derives from original yield, not prior scaled state", () => {
    const card = read("components/RecipeCard.tsx");
    const mode = read("components/cooking/CookingMode.tsx");
    assert.match(card, /servings\s*\/\s*Math\.max\(1,\s*recipe\.servings\)/);
    assert.match(mode, /session\.servings\s*\/\s*Math\.max\(1,\s*recipe\.servings\)/);
    // Engine is absolute: always scaleAmount(original, selected/original)
    const original = "1½ cups";
    assert.equal(scaleAmount(original, 8 / 4), "3 cups");
    assert.equal(scaleAmount(original, 12 / 4), "4½ cups");
    assert.equal(scaleAmount(original, 2 / 4), "¾ cups");
  });

  it("both UIs clamp servings with the shared helper", () => {
    assert.match(read("components/RecipeCard.tsx"), /clampRecipeServings/);
    assert.match(read("components/cooking/CookingMode.tsx"), /clampRecipeServings/);
    assert.match(read("components/cooking/CookingIngredientsPanel.tsx"), /clampRecipeServings/);
  });
});

describe("cooking session version vs user servings", () => {
  it("hashes recipe.source servings, not ephemeral user selection", () => {
    const recipe = fixtureRecipe();
    const a = cookingContentVersion(recipe);
    const b = cookingContentVersion({ ...recipe, servings: recipe.servings });
    assert.equal(a, b);
    // Changing published recipe yield changes content version
    const c = cookingContentVersion({ ...recipe, servings: 8 });
    assert.notEqual(a, c);
    // User selected servings live in session state; version helper only sees recipe.servings
    const sessionSrc = read("lib/cooking-session.ts");
    assert.match(sessionSrc, /servings: recipe\.servings/);
    assert.match(sessionSrc, /Deterministic fingerprint of cooking-relevant recipe content/);
    const mode = read("components/cooking/CookingMode.tsx");
    assert.match(mode, /cookingContentVersion\(recipe\)/);
  });

  it("ingredient checkbox keys are position-stable across scaling", () => {
    assert.equal(ingredientCheckKey(0, 2), "0:2");
    const panel = read("components/cooking/CookingIngredientsPanel.tsx");
    assert.match(panel, /ingredientCheckKey\(groupIndex, itemIndex\)/);
    assert.doesNotMatch(panel, /ingredientCheckKey\([^)]*amount/);
  });
});

describe("stepTimers regression with scaler hardening", () => {
  it("scaler does not touch instruction / timer structures", () => {
    const culinary = read("lib/culinary-format.ts");
    assert.doesNotMatch(culinary, /stepTimers|instructions/);
    assert.equal(minutesToTimerSeconds(10), 600);
    assert.deepEqual(alignStepTimers([600, null], 3), [600, null, undefined]);
  });

  it("servings bridge remains lightweight", () => {
    const bridge = read("lib/recipe-servings-bridge.ts");
    assert.match(bridge, /sessionStorage/);
    assert.doesNotMatch(bridge, /scaleAmount|formatCulinaryNumber/);
  });
});
