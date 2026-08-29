import assert from "node:assert/strict";
import { test } from "node:test";
import type { Recipe } from "@/data/types";
import type { ExtraField } from "./recipe-map";
import { recipeTocItems } from "./recipe-sections";

function baseRecipe(extras: ExtraField[] = []): Recipe & { extras: ExtraField[] } {
  return {
    slug: "test",
    title: "Test",
    excerpt: "",
    intro: "Intro",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "/x.jpg",
    imageAlt: "x",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    prepMinutes: 10,
    cookMinutes: 0,
    servings: 4,
    servingsUnit: "pieces",
    course: "Bread",
    method: "Stovetop",
    cuisine: "Home",
    categories: ["bread"],
    tags: [],
    ingredients: [],
    instructions: [],
    notes: [],
    nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
    extras,
  };
}

test("TOC omits Rise hours when value is default zero", () => {
  const toc = recipeTocItems(
    baseRecipe([{ key: "riseHours", label: "Rise hours", kind: "number", value: 0 }]),
    { includeComments: false },
  );
  assert.equal(
    toc.some((item) => item.label === "Rise hours"),
    false,
  );
});

test("TOC includes Rise hours when value is meaningful", () => {
  const toc = recipeTocItems(
    baseRecipe([{ key: "riseHours", label: "Rise hours", kind: "number", value: 2 }]),
    { includeComments: false },
  );
  assert.deepEqual(
    toc.filter((item) => item.id === "extra-riseHours"),
    [{ id: "extra-riseHours", label: "Rise hours" }],
  );
});
