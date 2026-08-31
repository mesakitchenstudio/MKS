import assert from "node:assert/strict";
import { test } from "node:test";
import { heroSeriesLinks, shouldShowHeroSeriesContext } from "./recipe-hero-series";
import type { RecipeSeriesLink } from "@/lib/series-types";

const breads: RecipeSeriesLink = {
  slug: "breads",
  title: "Breads",
  shortTitle: "Breads",
  nextItem: null,
};

const sourdough: RecipeSeriesLink = {
  slug: "sourdough-basics",
  title: "Sourdough Basics",
  shortTitle: "Sourdough Basics",
  nextItem: null,
};

test("hides Part of Breads when course is Bread", () => {
  assert.equal(shouldShowHeroSeriesContext([breads], "Bread", "Bread"), false);
  assert.deepEqual(heroSeriesLinks([breads], "Bread", "Bread"), []);
});

test("hides Part of Breads when only category matches", () => {
  assert.deepEqual(heroSeriesLinks([breads], "", null, ["breads"]), []);
});

test("keeps a meaningfully named series", () => {
  assert.equal(shouldShowHeroSeriesContext([sourdough], "Bread", "Bread"), true);
  assert.deepEqual(heroSeriesLinks([sourdough], "Bread"), [sourdough]);
});

test("filters only redundant series when multiple links exist", () => {
  assert.deepEqual(heroSeriesLinks([breads, sourdough], "Bread"), [sourdough]);
});
