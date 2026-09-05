import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RELATED_RECIPE_SHELF_LIMIT,
  shelfCanScrollNext,
  shelfCanScrollPrevious,
  shelfScrollStep,
} from "./recipe-related-shelf";
import { rankRelatedRecipesFromPool } from "./recipe-related";
import type { Recipe } from "@/data/types";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

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

function makeBread(slug: string, title: string): Recipe {
  return {
    ...baseRecipe,
    slug,
    title,
    course: "Bread",
    categories: ["breads"],
  };
}

describe("related recipe shelf", () => {
  it("disables previous at the start and next at the end", () => {
    assert.equal(shelfCanScrollPrevious(0), false);
    assert.equal(shelfCanScrollPrevious(40), true);
    assert.equal(shelfCanScrollNext(0, 900, 900), false);
    assert.equal(shelfCanScrollNext(0, 900, 1800), true);
    assert.equal(shelfCanScrollNext(900, 900, 1800), false);
  });

  it("advances by one measured card width plus gap", () => {
    assert.equal(shelfScrollStep({ itemWidth: 300, gap: 16, viewportWidth: 960 }), 316);
    assert.equal(shelfScrollStep({ itemWidth: 0, gap: 0, viewportWidth: 640 }), 640);
  });

  it("fetches up to nine ranked related recipes for the shelf", () => {
    assert.equal(RELATED_RECIPE_SHELF_LIMIT, 9);
    const pool = [
      baseRecipe,
      ...Array.from({ length: 12 }, (_, index) =>
        makeBread(`bread-${index}`, `Bread ${index}`),
      ),
    ];
    const ranked = rankRelatedRecipesFromPool(baseRecipe, pool, {
      limit: RELATED_RECIPE_SHELF_LIMIT,
    });
    assert.equal(ranked.length, 9);
    assert.ok(!ranked.some((item) => item.slug === "baguette"));
  });

  it("wires shelf markup, arrow labels, and analytics on the recipe page", () => {
    const page = read("app/recipes/[slug]/page.tsx");
    assert.match(page, /RELATED_RECIPE_SHELF_LIMIT/);
    assert.match(page, /CollectionRow title="More from the studio"/);

    const row = read("components/CollectionRow.tsx");
    assert.match(row, /data-related-shelf/);
    assert.match(row, /data-shelf-item/);
    assert.match(row, /Previous recipes/);
    assert.match(row, /Next recipes/);
    assert.match(row, /snap-x/);
    assert.match(row, /scrollByDirection\("previous"\)/);
    assert.match(row, /scrollByDirection\("next"\)/);
    assert.match(row, /recipe_related_scroll/);
    assert.match(row, /more_from_studio/);
    assert.match(row, /RecipeGridCard/);
    assert.match(row, /showControls/);
    assert.match(row, /items-end/);
    assert.match(row, /disabled:text-ink\/35/);
    assert.doesNotMatch(row, /rounded-full border border-line/);
    assert.doesNotMatch(row, /pagination|autoplay|embla|swiper/i);

    const analytics = read("lib/analytics.ts");
    assert.match(analytics, /"recipe_related_scroll"/);
    assert.match(analytics, /"previous" \| "next"/);
  });
});
