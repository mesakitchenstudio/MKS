import assert from "node:assert/strict";
import { test } from "node:test";
import { getContinuedViewingRecipeSlug } from "./recipe-related";
import type { RecipeSeriesLink } from "@/lib/series-types";
import type { WatchNextRecommendation } from "@/lib/youtube-data/watch-next-select";

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

test("getContinuedViewingRecipeSlug prefers series next over watch next", () => {
  const watchNext = { recipeSlug: "other-recipe" } as WatchNextRecommendation;
  assert.equal(getContinuedViewingRecipeSlug(watchNext, seriesLinks), "soft-stovetop-flatbread");
});

test("getContinuedViewingRecipeSlug falls back to watch next", () => {
  const watchNext = { recipeSlug: "other-recipe" } as WatchNextRecommendation;
  assert.equal(getContinuedViewingRecipeSlug(watchNext, []), "other-recipe");
});
