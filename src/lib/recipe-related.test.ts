import assert from "node:assert/strict";
import { test } from "node:test";
import { getContinuedViewingRecipeSlug, scoreRelatedRecipe } from "./recipe-related";
import type { RecipeSeriesLink } from "@/lib/series-types";
import type { WatchNextRecommendation } from "@/lib/youtube-data/watch-next-select";
import type { Recipe } from "@/data/types";

const seriesLinks: RecipeSeriesLink[] = [
  {
    slug: "breads",
    title: "Breads",
    shortTitle: "Breads",
    nextItem: {
      title: "Soft Stovetop Flatbread",
      recipeSlug: "soft-stovetop-flatbread",
      youtubeVideoId: "abc",
    },
  },
];

const baseRecipe = {
  slug: "baguette",
  title: "Baguette",
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
  prepMinutes: 10,
  cookMinutes: 20,
  servings: 1,
  servingsUnit: "loaf",
  course: "Bread",
  method: "",
  cuisine: "",
  categories: ["breads"],
  tags: ["bread"],
  ingredients: [],
  instructions: [],
  notes: [],
  nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
} satisfies Recipe;

test("getContinuedViewingRecipeSlug prefers series next over watch next", () => {
  const watchNext = { recipeSlug: "other-recipe" } as WatchNextRecommendation;
  assert.equal(getContinuedViewingRecipeSlug(watchNext, seriesLinks), "soft-stovetop-flatbread");
});

test("getContinuedViewingRecipeSlug falls back to watch next", () => {
  const watchNext = { recipeSlug: "other-recipe" } as WatchNextRecommendation;
  assert.equal(getContinuedViewingRecipeSlug(watchNext, []), "other-recipe");
});

test("scoreRelatedRecipe prefers same course over unrelated dessert", () => {
  const bread = {
    ...baseRecipe,
    slug: "focaccia",
    title: "Focaccia",
    course: "Bread",
    categories: ["breads"],
  };
  const cupcake = {
    ...baseRecipe,
    slug: "cupcakes",
    title: "Cupcakes",
    course: "Dessert",
    categories: ["desserts"],
    tags: ["cake"],
  };
  const peers = new Set<string>();
  assert.ok(
    scoreRelatedRecipe(baseRecipe, bread, peers) > scoreRelatedRecipe(baseRecipe, cupcake, peers),
  );
  assert.equal(scoreRelatedRecipe(baseRecipe, cupcake, peers), 0);
});
