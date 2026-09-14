import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareRecipeCollectionMembership,
  RECIPE_COLLECTION_MEMBERSHIP_CAP,
  selectRecipeCollectionMemberships,
} from "./series-recipe-membership.ts";

describe("recipe Collection membership ordering", () => {
  it("orders CUSTOM before YOUTUBE, then sortOrder, then title", () => {
    const ordered = selectRecipeCollectionMemberships([
      { syncMode: "YOUTUBE", sortOrder: 0, title: "A Playlist" },
      { syncMode: "CUSTOM", sortOrder: 2, title: "Zebra" },
      { syncMode: "CUSTOM", sortOrder: 1, title: "Alpha" },
      { syncMode: "CUSTOM", sortOrder: 1, title: "Beta" },
      { syncMode: "YOUTUBE", sortOrder: 0, title: "B Playlist" },
    ]);
    assert.deepEqual(
      ordered.map((row) => row.title),
      ["Alpha", "Beta", "Zebra"],
    );
    assert.equal(ordered.length, RECIPE_COLLECTION_MEMBERSHIP_CAP);
  });

  it("caps at 3", () => {
    const rows = [1, 2, 3, 4, 5].map((n) => ({
      syncMode: "CUSTOM",
      sortOrder: n,
      title: `C${n}`,
    }));
    assert.equal(selectRecipeCollectionMemberships(rows).length, 3);
  });

  it("compare treats blank syncMode as Mesa Collection (CUSTOM rank)", () => {
    assert.ok(
      compareRecipeCollectionMembership(
        { syncMode: "", sortOrder: 0, title: "A" },
        { syncMode: "YOUTUBE", sortOrder: 0, title: "B" },
      ) < 0,
    );
  });
});
