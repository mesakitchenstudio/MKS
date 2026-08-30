import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRecipeTypeClassificationPrompt,
  resolveRecipeTypeFromModelOutput,
} from "./classify-recipe-type";

const mesaTypes = [
  { id: "type-bread", name: "Bread", slug: "bread", description: "Yeasted and quick breads" },
  { id: "type-breakfast", name: "Breakfast", slug: "breakfast", description: "Morning dishes" },
  { id: "type-cake", name: "Cake", slug: "cake", description: "Layer and loaf cakes" },
  { id: "type-condiment", name: "Condiment", slug: "condiment", description: "Sauces and dressings" },
  { id: "type-cookie", name: "Cookie", slug: "cookie", description: "Cookies and bars" },
  { id: "type-dessert", name: "Dessert", slug: "dessert", description: "Sweet treats and fried desserts" },
  { id: "type-drink", name: "Drink", slug: "drink", description: "Beverages" },
  { id: "type-main", name: "Main", slug: "main", description: "Main courses and pasta" },
  { id: "type-side", name: "Side", slug: "side", description: "Side dishes" },
];

test("resolveRecipeTypeFromModelOutput resolves by id with confidence levels", () => {
  const result = resolveRecipeTypeFromModelOutput(
    { recipeTypeId: "type-dessert", confidence: "HIGH", reasoning: "Churros are a dessert." },
    mesaTypes,
  );
  assert.deepEqual(result, {
    recipeTypeId: "type-dessert",
    recipeTypeName: "Dessert",
    confidence: "HIGH",
    reasoning: "Churros are a dessert.",
  });
});

test("resolveRecipeTypeFromModelOutput falls back to name when id is wrong", () => {
  const result = resolveRecipeTypeFromModelOutput(
    { recipeTypeId: "Dessert", confidence: "MEDIUM", reasoning: "Sweet fried dough." },
    mesaTypes,
  );
  assert.equal(result?.recipeTypeId, "type-dessert");
  assert.equal(result?.recipeTypeName, "Dessert");
  assert.equal(result?.confidence, "MEDIUM");
});

test("resolveRecipeTypeFromModelOutput returns null for invented types", () => {
  const result = resolveRecipeTypeFromModelOutput(
    { recipeTypeId: "type-snack", confidence: "HIGH", reasoning: "Not in Mesa." },
    mesaTypes,
  );
  assert.equal(result, null);
});

test("resolveRecipeTypeFromModelOutput normalizes unknown confidence to LOW", () => {
  const result = resolveRecipeTypeFromModelOutput(
    { recipeTypeId: "type-main", confidence: "maybe", reasoning: "Pasta dish." },
    mesaTypes,
  );
  assert.equal(result?.confidence, "LOW");
});

test("buildRecipeTypeClassificationPrompt includes video metadata and Mesa types", () => {
  const prompt = buildRecipeTypeClassificationPrompt({
    video: {
      title: "Homemade Churros with Rich Chocolate Sauce (So Crispy!)",
      description: "0:00 Intro\n0:45 Mix batter\n\nFull recipe below.",
      tags: ["churros", "dessert"],
      durationDisplay: "12:34",
      durationSeconds: 754,
    },
    types: mesaTypes,
  });

  assert.match(prompt, /Homemade Churros/);
  assert.match(prompt, /type-dessert/);
  assert.match(prompt, /Dessert/);
  assert.match(prompt, /churros, dessert/);
  assert.match(prompt, /12:34/);
  assert.match(prompt, /Mix batter/);
  assert.match(prompt, /Never invent a new type/);
});
