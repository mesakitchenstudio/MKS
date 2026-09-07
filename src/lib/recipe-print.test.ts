import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Recipe } from "@/data/types";
import { scaleIngredientAmount, scaleAmount } from "./culinary-format.ts";
import {
  recipePrintCanonicalUrl,
  recipePrintMetaItems,
  recipePrintYieldLabel,
} from "./recipe-print.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    slug: "classic-baguettes",
    title: "Classic French Baguettes",
    excerpt: "Crisp crust, open crumb.",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: ["Score deeply."],
    faqs: [],
    image: "/b.jpg",
    imageAlt: "Baguettes",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-02",
    prepMinutes: 20,
    cookMinutes: 0,
    bakeMinutes: 24,
    restMinutes: 120,
    difficulty: "Intermediate",
    servings: 4,
    servingsUnit: "baguettes",
    course: "Bread",
    method: "Bake",
    cuisine: "French",
    categories: ["breads"],
    tags: [],
    utensils: ["Sheet pan"],
    ingredients: [
      {
        name: "Dough",
        items: [
          { item: "bread flour", amount: "500 g" },
          { item: "water", amount: "1½ cups" },
          { item: "salt", amount: "to taste" },
        ],
      },
    ],
    instructions: [
      { name: "Mix", steps: ["Combine.", "Knead."] },
      { name: "Bake", steps: ["Bake until golden."] },
    ],
    notes: ["Cool on a rack."],
    nutrition: { calories: 200, carbs: 0, protein: 0, fat: 0 },
    ...overrides,
  };
}

describe("recipe print helpers", () => {
  it("builds canonical recipe URL", () => {
    assert.equal(
      recipePrintCanonicalUrl("classic-baguettes"),
      "https://mesakitchenstudio.com/recipes/classic-baguettes",
    );
  });

  it("yield label uses selected servings", () => {
    assert.equal(recipePrintYieldLabel(8, "baguettes"), "8 baguettes");
    assert.equal(recipePrintYieldLabel(0, "servings"), "1 servings");
  });

  it("meta yield agrees with selected servings for scaling", () => {
    const recipe = baseRecipe();
    const selected = 8;
    const meta = recipePrintMetaItems(recipe, selected);
    const yieldItem = meta.find((item) => item.label === "Yield");
    assert.equal(yieldItem?.value, "8 baguettes");
    const factor = selected / recipe.servings;
    assert.equal(scaleIngredientAmount("500 g", factor), "1000 g");
    assert.equal(scaleAmount("1½ cups", factor), scaleIngredientAmount("1½ cups", factor));
  });

  it("omits empty timing fields", () => {
    const meta = recipePrintMetaItems(
      baseRecipe({ prepMinutes: 0, bakeMinutes: 0, cookMinutes: 0, restMinutes: 0 }),
      4,
    );
    assert.ok(!meta.some((item) => item.label === "Prep"));
    assert.ok(meta.some((item) => item.label === "Yield"));
  });
});

describe("recipe print architecture", () => {
  it("uses a dedicated print sheet fed by live servings state", () => {
    const card = read("components/RecipeCard.tsx");
    const sheet = read("components/RecipePrintSheet.tsx");
    assert.match(card, /RecipePrintSheet/);
    assert.match(card, /<RecipePrintSheet recipe=\{recipe\} servings=\{servings\}/);
    assert.match(sheet, /scaleIngredientAmount/);
    assert.match(sheet, /recipePrintMetaItems\(recipe, servings\)/);
    assert.match(sheet, /recipePrintCanonicalUrl/);
    assert.doesNotMatch(sheet, /window\.print|CookingMode/);
  });

  it("keeps familiar Print action as window.print without a /print route", () => {
    const actions = read("components/RecipePageHeroActions.tsx");
    assert.match(actions, /window\.print\(\)/);
    assert.match(actions, /recipe_print/);
    let hasPrintRoute = false;
    try {
      readFileSync(path.join(root, "../app/recipes/[slug]/print/page.tsx"), "utf8");
      hasPrintRoute = true;
    } catch {
      hasPrintRoute = false;
    }
    assert.equal(hasPrintRoute, false);
  });

  it("hides interactive recipe chrome and consent UI when printing", () => {
    const css = read("app/globals.css");
    assert.match(css, /\.recipe-screen-only/);
    assert.match(css, /\.recipe-print-sheet/);
    assert.match(css, /\.recipe-print-sheet\[hidden\]/);
    assert.match(read("components/RecipePageHero.tsx"), /recipe-screen-only/);
    assert.match(read("components/RecipeLearnSection.tsx"), /recipe-screen-only/);
    assert.match(read("components/PrivacyConsentUi.tsx"), /no-print/);
  });

  it("does not add Print inside Cooking Mode", () => {
    const mode = read("components/cooking/CookingMode.tsx");
    assert.doesNotMatch(mode, /window\.print|recipe_print|RecipePrintSheet/);
  });

  it("print sheet does not fork the scaler", () => {
    const sheet = read("components/RecipePrintSheet.tsx");
    assert.match(sheet, /from \"@\/lib\/culinary-format\"/);
    assert.doesNotMatch(sheet, /function scaleAmount|function scaleIngredientAmount/);
  });
});
