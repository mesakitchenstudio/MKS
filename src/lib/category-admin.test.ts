import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categoryGroupLabel,
  formatRecipeCount,
  partitionCategoriesByGroup,
  type AdminCategory,
} from "./category-admin";

test("categoryGroupLabel maps persisted values to menu labels", () => {
  assert.equal(categoryGroupLabel("desserts"), "Desserts");
  assert.equal(categoryGroupLabel("course"), "Course");
  assert.equal(categoryGroupLabel("method"), "Method");
  assert.equal(categoryGroupLabel("holiday"), "Season");
});

test("formatRecipeCount handles zero, one, and plural", () => {
  assert.equal(formatRecipeCount(0), "0 recipes");
  assert.equal(formatRecipeCount(1), "1 recipe");
  assert.equal(formatRecipeCount(2), "2 recipes");
});

test("partitionCategoriesByGroup includes every category exactly once", () => {
  const categories: AdminCategory[] = [
    { id: "1", name: "A", slug: "a", description: "", group: "desserts", recipeCount: 0 },
    { id: "2", name: "B", slug: "b", description: "", group: "course", recipeCount: 1 },
    { id: "3", name: "C", slug: "c", description: "", group: "method", recipeCount: 2 },
    { id: "4", name: "D", slug: "d", description: "", group: "holiday", recipeCount: 0 },
  ];
  const sections = partitionCategoriesByGroup(categories);
  const flattened = sections.flatMap((section) => section.categories);
  assert.equal(flattened.length, categories.length);
  assert.deepEqual(
    flattened.map((item) => item.id).sort(),
    categories.map((item) => item.id).sort(),
  );
  assert.equal(sections.find((s) => s.group === "desserts")?.categories.length, 1);
  assert.equal(sections.find((s) => s.group === "course")?.categories.length, 1);
  assert.equal(sections.find((s) => s.group === "method")?.categories.length, 1);
  assert.equal(sections.find((s) => s.group === "holiday")?.categories.length, 1);
});

test("partitionCategoriesByGroup sorts within group by name", () => {
  const categories: AdminCategory[] = [
    {
      id: "1",
      name: "Zebra",
      slug: "zebra",
      description: "",
      group: "course",
      recipeCount: 0,
    },
    {
      id: "2",
      name: "Apple",
      slug: "apple",
      description: "",
      group: "course",
      recipeCount: 0,
    },
    {
      id: "3",
      name: "Cakes",
      slug: "cakes",
      description: "",
      group: "desserts",
      recipeCount: 2,
    },
  ];
  const sections = partitionCategoriesByGroup(categories);
  const course = sections.find((section) => section.group === "course");
  assert.equal(course?.categories[0]?.name, "Apple");
  assert.equal(course?.categories[1]?.name, "Zebra");
  assert.equal(sections.find((section) => section.group === "desserts")?.categories[0]?.name, "Cakes");
});
