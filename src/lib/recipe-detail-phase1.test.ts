import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { recipeJsonLd } from "./schema";
import { recipePrimaryCategoryDisplayLabel } from "./recipe-primary-taxonomy";
import type { Recipe } from "@/data/types";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    slug: "golden-crispy-rice-with-eggs",
    title: "Golden Crispy Rice with Eggs: You Won't Believe How Easy This Is!",
    excerpt: "Crispy rice, soft eggs.",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "https://example.com/rice.jpg",
    imageAlt: "Crispy rice",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-02",
    prepMinutes: 10,
    cookMinutes: 20,
    servings: 2,
    servingsUnit: "servings",
    course: "Main",
    method: "Stovetop",
    cuisine: "Mexican",
    dishName: "Golden Crispy Rice with Eggs",
    typeName: "Main",
    categories: ["main-dishes"],
    tags: [],
    ingredients: [{ items: [{ item: "Rice", amount: "2 cups" }] }],
    instructions: [{ steps: ["Cook."] }],
    notes: [],
    nutrition: { calories: 330, carbs: 0, protein: 0, fat: 0 },
    ...overrides,
  };
}

describe("public recipe detail phase 1", () => {
  it("hero uses shared taxonomy label and dish H1 helpers", () => {
    const hero = read("components/RecipePageHero.tsx");
    assert.match(hero, /resolvePublicRecipeH1/);
    assert.match(hero, /resolveRecipeSecondaryDishLine/);
    assert.match(hero, /recipePrimaryCategoryDisplayLabel/);
    assert.doesNotMatch(hero, /\{recipe\.course\}/);
  });

  it("maps Main course recipes to Main Dishes via shared helper", () => {
    assert.equal(recipePrimaryCategoryDisplayLabel(baseRecipe()), "Main Dishes");
  });

  it("keeps metadata and Recipe schema name on canonical title", () => {
    const page = read("app/recipes/[slug]/page.tsx");
    assert.match(page, /title: recipe\.title/);
    assert.match(page, /openGraph:[\s\S]*title: `\$\{recipe\.title\} \| \$\{site\.name\}`/);
    assert.match(page, /twitter:[\s\S]*title: `\$\{recipe\.title\} \| \$\{site\.name\}`/);
    assert.match(page, /canonical: `\/recipes\/\$\{recipe\.slug\}`/);

    const data = recipeJsonLd(baseRecipe());
    assert.equal(
      data.name,
      "Golden Crispy Rice with Eggs: You Won't Believe How Easy This Is!",
    );
    assert.match(read("lib/schema.ts"), /DEFERRED SEO\/schema identity/);
  });

  it("Recipe JSON-LD nutrition omits unknown zero macros", () => {
    const caloriesOnly = recipeJsonLd(baseRecipe());
    assert.deepEqual(caloriesOnly.nutrition, {
      "@type": "NutritionInformation",
      calories: "330 calories",
    });

    const partial = recipeJsonLd(
      baseRecipe({ nutrition: { calories: 330, carbs: 0, protein: 12, fat: 0 } }),
    );
    assert.deepEqual(partial.nutrition, {
      "@type": "NutritionInformation",
      calories: "330 calories",
      proteinContent: "12 grams",
    });

    const empty = recipeJsonLd(
      baseRecipe({ nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 } }),
    );
    assert.equal(empty.nutrition, undefined);
  });

  it("workspace nutrition and watch hooks use the public policy helpers", () => {
    const card = read("components/RecipeCard.tsx");
    assert.match(card, /formatPublicNutritionSummary/);
    assert.doesNotMatch(card, /nutrition\.carbs\}g carbs/);

    const youtube = read("lib/recipe-youtube.ts");
    assert.match(youtube, /resolveRecipeCardTitle/);
    assert.doesNotMatch(youtube, /recipe\.title\.toLowerCase\(\)/);

    const watchNext = read("lib/youtube-data/watch-next.ts");
    assert.match(watchNext, /resolveRecipeCardTitle/);
    assert.match(watchNext, /readEditorialDishName/);
  });
});
