import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listPopulatedDiscoveryCategories,
  listPopulatedPrimaryCategorySlugs,
} from "./public-primary-categories.ts";

describe("public primary category population", () => {
  it("hides empty drinks and toppings while keeping populated courses", () => {
    const recipes = [
      {
        categories: ["breads"],
        course: "Bread",
        typeName: "Bread",
      },
      {
        categories: ["desserts"],
        course: "Dessert",
        typeName: "Dessert",
      },
      {
        categories: ["main-dishes"],
        course: "Main",
        typeName: "Main",
      },
    ];

    assert.deepEqual(listPopulatedPrimaryCategorySlugs(recipes), [
      "breads",
      "main-dishes",
      "desserts",
    ]);

    const discovery = listPopulatedDiscoveryCategories(recipes);
    assert.equal(discovery[0]?.id, "all");
    assert.deepEqual(
      discovery.slice(1).map((entry) => entry.id),
      ["breads", "main-dishes", "desserts"],
    );
  });
});
