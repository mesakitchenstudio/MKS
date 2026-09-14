import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scoreRelatedSeriesCandidate,
  selectRelatedSeries,
  type RelatedSeriesScoringCandidate,
} from "./series-related";

function candidate(
  partial: Partial<RelatedSeriesScoringCandidate> & Pick<RelatedSeriesScoringCandidate, "id" | "slug" | "title">,
): RelatedSeriesScoringCandidate {
  return {
    sortOrder: 0,
    syncMode: "CUSTOM",
    publishedRecipeIds: [],
    categorySlugs: [],
    typeNames: [],
    visibleItemCount: 1,
    isPublished: true,
    ...partial,
  };
}

const current = candidate({
  id: "current",
  slug: "french-desserts",
  title: "French Desserts",
  publishedRecipeIds: ["r1", "r2", "r3"],
  categorySlugs: ["desserts", "baking"],
  typeNames: ["Dessert", "Pastry"],
  visibleItemCount: 3,
});

describe("Related Collections scoring", () => {
  it("scores shared recipes strongest", () => {
    const other = candidate({
      id: "other",
      slug: "french-baking",
      title: "French Baking",
      publishedRecipeIds: ["r2"],
      syncMode: "YOUTUBE",
      visibleItemCount: 2,
    });
    const result = scoreRelatedSeriesCandidate(current, other);
    assert.ok(result);
    assert.equal(result.sharedRecipeCount, 1);
    assert.equal(result.score, 10);
    assert.equal(result.syncModeBonus, 0);
  });

  it("adds category and type overlap points but still requires threshold", () => {
    const other = candidate({
      id: "other",
      slug: "chocolate",
      title: "Chocolate Desserts",
      publishedRecipeIds: [],
      categorySlugs: ["desserts"],
      typeNames: ["Dessert"],
      syncMode: "YOUTUBE",
      visibleItemCount: 2,
    });
    // 3 + 2 = 5, below threshold without syncMode match
    assert.equal(scoreRelatedSeriesCandidate(current, other), null);
  });

  it("applies a small syncMode bonus without dominating relevance", () => {
    const other = candidate({
      id: "other",
      slug: "pastry",
      title: "Pastry Favorites",
      publishedRecipeIds: [],
      categorySlugs: ["desserts", "baking"],
      typeNames: ["Dessert", "Pastry"],
      syncMode: "CUSTOM",
      visibleItemCount: 4,
    });
    const result = scoreRelatedSeriesCandidate(current, other);
    assert.ok(result);
    assert.equal(result.syncModeBonus, 1);
    assert.ok(result.score >= 6);
    assert.equal(result.sharedRecipeCount, 0);
  });

  it("excludes unpublished candidates", () => {
    const other = candidate({
      id: "draft",
      slug: "draft",
      title: "Draft",
      isPublished: false,
      publishedRecipeIds: ["r1"],
      visibleItemCount: 1,
    });
    assert.equal(scoreRelatedSeriesCandidate(current, other), null);
  });

  it("excludes the current Collection", () => {
    assert.equal(scoreRelatedSeriesCandidate(current, current), null);
  });

  it("excludes zero-visible candidates", () => {
    const other = candidate({
      id: "empty",
      slug: "empty",
      title: "Empty",
      publishedRecipeIds: ["r1"],
      visibleItemCount: 0,
    });
    assert.equal(scoreRelatedSeriesCandidate(current, other), null);
  });

  it("rejects weak single-signal taxonomy candidates", () => {
    const other = candidate({
      id: "weak",
      slug: "weak",
      title: "Weak",
      categorySlugs: ["desserts"],
      typeNames: [],
      visibleItemCount: 2,
    });
    assert.equal(scoreRelatedSeriesCandidate(current, other), null);
  });

  it("qualifies multi-signal taxonomy candidates at threshold", () => {
    const other = candidate({
      id: "multi",
      slug: "multi",
      title: "Multi",
      categorySlugs: ["desserts"],
      typeNames: ["Dessert"],
      syncMode: "CUSTOM",
      visibleItemCount: 2,
    });
    const result = scoreRelatedSeriesCandidate(current, other);
    assert.ok(result);
    assert.equal(result.score, 6);
  });

  it("caps results at 3 with deterministic tie ordering", () => {
    const candidates = [
      candidate({
        id: "a",
        slug: "a",
        title: "A",
        publishedRecipeIds: ["r1"],
        sortOrder: 2,
        visibleItemCount: 1,
      }),
      candidate({
        id: "b",
        slug: "b",
        title: "B",
        publishedRecipeIds: ["r1"],
        sortOrder: 1,
        visibleItemCount: 1,
      }),
      candidate({
        id: "c",
        slug: "c",
        title: "C",
        publishedRecipeIds: ["r1", "r2"],
        sortOrder: 5,
        visibleItemCount: 2,
      }),
      candidate({
        id: "d",
        slug: "d",
        title: "D",
        publishedRecipeIds: ["r1"],
        sortOrder: 0,
        visibleItemCount: 1,
      }),
      candidate({
        id: "dup",
        slug: "a",
        title: "A dup",
        publishedRecipeIds: ["r1"],
        sortOrder: 9,
        visibleItemCount: 1,
      }),
    ];
    // Force duplicate id to verify de-dupe
    candidates[4] = { ...candidates[4]!, id: "a" };

    const selected = selectRelatedSeries(current, candidates, 3);
    assert.equal(selected.length, 3);
    assert.equal(selected[0]?.id, "c");
    assert.deepEqual(
      selected.map((row) => row.id),
      ["c", "d", "b"],
    );
  });

  it("returns an empty list when nothing qualifies", () => {
    const selected = selectRelatedSeries(current, [
      candidate({
        id: "x",
        slug: "grilled",
        title: "Grilled Chicken",
        categorySlugs: ["dinner"],
        typeNames: ["Main"],
        visibleItemCount: 3,
      }),
    ]);
    assert.deepEqual(selected, []);
  });
});
