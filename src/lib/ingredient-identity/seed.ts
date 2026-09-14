import type { IngredientSeedEntry } from "./types";

/**
 * Conservative developmental seed for ING-1 tests and corpus analysis.
 *
 * Policy:
 * - Prefer false negatives (unresolved) over unsafe collapses
 * - Plurals and editorial variants live in aliases — never stemming
 * - Culinary-function splits stay separate (Egg yolk ≠ Egg; Cream ≠ Cream cheese)
 * - Butter vs Unsalted butter: Mesa often authors "unsalted butter", so that is
 *   the curated identity; plain "butter" aliases to it for discovery v1
 * - Flour variants stay separate (all-purpose vs bread)
 * - Potato specificity aliases to Potato when safe for discovery
 *
 * This is NOT a complete food ontology.
 */
export const INGREDIENT_IDENTITY_SEED: IngredientSeedEntry[] = [
  {
    name: "Egg",
    aliases: ["egg", "eggs", "large egg", "large eggs"],
  },
  {
    name: "Egg yolk",
    aliases: ["egg yolk", "egg yolks", "large egg yolk", "large egg yolks"],
  },
  {
    name: "Egg white",
    aliases: ["egg white", "egg whites", "large egg white", "large egg whites"],
  },
  {
    name: "Unsalted butter",
    aliases: ["unsalted butter", "cold unsalted butter", "butter"],
  },
  {
    name: "All-purpose flour",
    aliases: ["all-purpose flour", "all purpose flour", "ap flour"],
  },
  {
    name: "Bread flour",
    aliases: ["bread flour"],
  },
  {
    name: "Potato",
    aliases: ["potato", "potatoes", "russet potato", "russet potatoes", "baby potatoes"],
  },
  {
    name: "Cream",
    aliases: ["cream", "heavy cream", "whipping cream"],
  },
  {
    name: "Cream cheese",
    aliases: ["cream cheese"],
  },
  {
    name: "Kosher salt",
    aliases: ["kosher salt", "salt"],
  },
  {
    name: "Granulated sugar",
    aliases: ["granulated sugar", "sugar", "white sugar"],
  },
  {
    name: "Brown sugar",
    aliases: ["brown sugar", "packed dark brown sugar", "light brown sugar", "dark brown sugar"],
  },
  {
    name: "Powdered sugar",
    aliases: ["powdered sugar", "confectioners sugar", "icing sugar"],
  },
  {
    name: "Olive oil",
    aliases: ["olive oil", "extra-virgin olive oil", "extra virgin olive oil", "evoo"],
  },
  {
    name: "Water",
    aliases: ["water", "warm water", "cold water"],
  },
  {
    name: "Vanilla extract",
    aliases: ["vanilla extract", "vanilla", "pure vanilla extract"],
  },
  {
    name: "Baking powder",
    aliases: ["baking powder"],
  },
  {
    name: "Baking soda",
    aliases: ["baking soda", "bicarbonate of soda"],
  },
  {
    name: "Milk",
    aliases: ["milk", "whole milk"],
  },
  {
    name: "Buttermilk",
    aliases: ["buttermilk"],
  },
  {
    name: "Sour cream",
    aliases: ["sour cream"],
  },
  {
    name: "Yogurt",
    aliases: ["yogurt", "plain yogurt", "greek yogurt"],
  },
  {
    name: "Garlic",
    aliases: ["garlic", "garlic clove", "garlic cloves"],
  },
  {
    name: "Onion",
    aliases: ["onion", "onions", "yellow onion", "white onion"],
  },
  {
    name: "Chicken",
    aliases: ["chicken", "bone-in chicken thighs", "chicken thighs", "chicken breast"],
  },
  {
    name: "Lemon",
    aliases: ["lemon", "lemon juice", "lemon zest"],
  },
  {
    name: "Orange",
    aliases: ["orange", "orange juice", "orange zest"],
  },
  {
    name: "Honey",
    aliases: ["honey"],
  },
  {
    name: "Yeast",
    aliases: ["yeast", "instant yeast", "active dry yeast"],
  },
  {
    name: "Cilantro",
    aliases: ["cilantro", "cilantro leaves", "coriander leaves"],
  },
  {
    name: "Tomato",
    aliases: ["tomato", "tomatoes", "canned tomatoes"],
  },
];
