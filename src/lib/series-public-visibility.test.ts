import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminSeriesItemToVisibilityInput,
  countSeriesMembershipVisibility,
  isSeriesMembershipPubliclyRenderable,
} from "./series-public-visibility";
import { formatCollectionContentCount } from "./series-collection-count";

describe("series public visibility", () => {
  it("treats published recipe memberships as renderable", () => {
    assert.equal(
      isSeriesMembershipPubliclyRenderable({
        recipeId: "r1",
        recipePublished: true,
      }),
      true,
    );
  });

  it("hides draft recipes without a public video", () => {
    assert.equal(
      isSeriesMembershipPubliclyRenderable({
        recipeId: "r1",
        recipePublished: false,
      }),
      false,
    );
  });

  it("keeps public videos renderable", () => {
    assert.equal(
      isSeriesMembershipPubliclyRenderable({
        youtubeVideoId: "abcdefghijk",
        videoPrivacy: "public",
      }),
      true,
    );
  });

  it("counts total, public, and hidden memberships", () => {
    const counts = countSeriesMembershipVisibility([
      { recipeId: "a", recipePublished: true },
      { recipeId: "b", recipePublished: false },
      { youtubeVideoId: "vid12345678", videoPrivacy: "public" },
      { removedFromPlaylist: true, recipeId: "c", recipePublished: true },
    ]);
    assert.deepEqual(counts, { totalMembers: 4, publicVisible: 2, hidden: 2 });
  });

  it("maps admin drafts into visibility inputs", () => {
    const input = adminSeriesItemToVisibilityInput({
      removedFromPlaylist: false,
      recipeId: "r1",
      recipePublished: true,
      youtubeVideoId: "",
      videoPrivacy: "",
    });
    assert.equal(isSeriesMembershipPubliclyRenderable(input), true);
  });
});

describe("collection content counts", () => {
  it("prefers recipe language for recipe-only Collections", () => {
    assert.equal(
      formatCollectionContentCount({ recipeCount: 4, videoCount: 0, itemCount: 4 }),
      "4 recipes",
    );
  });

  it("prefers video language for video-only Collections", () => {
    assert.equal(
      formatCollectionContentCount({ recipeCount: 0, videoCount: 2, itemCount: 2 }),
      "2 videos",
    );
  });

  it("uses items for mixed content", () => {
    assert.equal(
      formatCollectionContentCount({ recipeCount: 2, videoCount: 2, itemCount: 3 }),
      "3 items",
    );
  });

  it("returns empty for zero items", () => {
    assert.equal(
      formatCollectionContentCount({ recipeCount: 0, videoCount: 0, itemCount: 0 }),
      "",
    );
  });
});
