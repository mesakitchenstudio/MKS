import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CATEGORY_COLLECTION_SHELF_CAP,
  isCategoryCloneCollection,
  scoreCategoryCollectionCandidate,
  selectCategoryCollections,
  type CategoryCollectionScoringCandidate,
} from "./series-category-related.ts";

function candidate(
  overrides: Partial<CategoryCollectionScoringCandidate> & Pick<CategoryCollectionScoringCandidate, "id" | "title">,
): CategoryCollectionScoringCandidate {
  return {
    slug: overrides.slug ?? overrides.id,
    sortOrder: 0,
    syncMode: "CUSTOM",
    sharedCount: 2,
    collectionPublicRecipeCount: 4,
    ...overrides,
  };
}

const desserts = { name: "Desserts", slug: "desserts" };

describe("category → Collection relevance", () => {
  it("qualifies sharedCount >= 2", () => {
    const result = scoreCategoryCollectionCandidate(
      candidate({ id: "fr", title: "French Desserts", sharedCount: 2, collectionPublicRecipeCount: 10 }),
      desserts,
    );
    assert.ok(result);
    assert.equal(result.sharedCount, 2);
  });

  it("qualifies one shared with share >= 40%", () => {
    const result = scoreCategoryCollectionCandidate(
      candidate({ id: "choc", title: "Chocolate Desserts", sharedCount: 1, collectionPublicRecipeCount: 2 }),
      desserts,
    );
    assert.ok(result);
    assert.equal(result.share, 0.5);
  });

  it("excludes weak one-of-many overlap", () => {
    const result = scoreCategoryCollectionCandidate(
      candidate({
        id: "mixed",
        title: "Weekend Cooking",
        sharedCount: 1,
        collectionPublicRecipeCount: 20,
      }),
      desserts,
    );
    assert.equal(result, null);
  });

  it("excludes category clone Collections", () => {
    assert.equal(isCategoryCloneCollection({ title: "Desserts", slug: "desserts" }, desserts), true);
    assert.equal(
      scoreCategoryCollectionCandidate(
        candidate({ id: "clone", title: "Desserts", slug: "desserts", sharedCount: 5, collectionPublicRecipeCount: 5 }),
        desserts,
      ),
      null,
    );
    assert.equal(
      isCategoryCloneCollection({ title: "French Desserts", slug: "french-desserts" }, desserts),
      false,
    );
  });

  it("caps at 3 with deterministic ordering", () => {
    const winners = selectCategoryCollections(
      [
        candidate({ id: "a", title: "Alpha", sharedCount: 3, collectionPublicRecipeCount: 3, sortOrder: 2 }),
        candidate({ id: "b", title: "Beta", sharedCount: 3, collectionPublicRecipeCount: 3, sortOrder: 1 }),
        candidate({
          id: "c",
          title: "Gamma YT",
          syncMode: "YOUTUBE",
          sharedCount: 3,
          collectionPublicRecipeCount: 3,
          sortOrder: 0,
        }),
        candidate({ id: "d", title: "Delta", sharedCount: 2, collectionPublicRecipeCount: 2, sortOrder: 0 }),
      ],
      desserts,
    );
    assert.equal(winners.length, CATEGORY_COLLECTION_SHELF_CAP);
    assert.deepEqual(
      winners.map((row) => row.id),
      ["b", "a", "c"],
    );
  });

  it("returns empty when nothing qualifies", () => {
    assert.deepEqual(
      selectCategoryCollections(
        [
          candidate({
            id: "weak",
            title: "Mixed Bag",
            sharedCount: 1,
            collectionPublicRecipeCount: 20,
          }),
        ],
        desserts,
      ),
      [],
    );
  });
});
