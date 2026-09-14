/**
 * READ-ONLY ingredient corpus analysis (ING-1).
 *
 * Does not mutate database, Recipe.values, seed data, or canonical config.
 *
 * Usage:
 *   npx tsx scripts/analyze-ingredient-corpus.ts
 */
import { recipes } from "../src/data/recipes";
import {
  analyzeIngredientCorpus,
  assertValidIngredientSeed,
  formatIngredientCorpusReport,
  INGREDIENT_IDENTITY_SEED,
} from "../src/lib/ingredient-identity";

assertValidIngredientSeed(INGREDIENT_IDENTITY_SEED);

const report = analyzeIngredientCorpus({
  recipes: recipes.map((recipe) => ({
    title: recipe.title,
    ingredients: recipe.ingredients,
  })),
  seed: INGREDIENT_IDENTITY_SEED,
});

console.log(formatIngredientCorpusReport(report));
