import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPublicVideoCatalogue,
  excludeFeaturedFromGrid,
  selectFeaturedPublicVideo,
} from "./catalogue.ts";
import {
  isPublicCatalogueEligible,
  isPublicFeaturedEligible,
  toPublicVideoCard,
} from "./eligibility.ts";
import type { PublicVideoSourceRow } from "./types.ts";

function row(partial: Partial<PublicVideoSourceRow> & Pick<PublicVideoSourceRow, "videoId">): PublicVideoSourceRow {
  return {
    title: "Homemade Caesar Salad Technique",
    thumbnailUrl: `https://i.ytimg.com/vi/${partial.videoId}/hqdefault.jpg`,
    durationDisplay: "6:20",
    durationSeconds: 380,
    publishedAt: new Date("2026-01-15T12:00:00.000Z"),
    privacyStatus: "public",
    embeddable: true,
    description: "",
    tags: "[]",
    ...partial,
  };
}

describe("public video eligibility", () => {
  it("lists public videos with title and thumbnail", () => {
    assert.equal(
      isPublicCatalogueEligible({
        videoId: "abcdefghijk",
        title: "Caesar dressing",
        thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
        privacyStatus: "public",
      }),
      true,
    );
  });

  it("excludes private and hidden videos", () => {
    assert.equal(
      isPublicCatalogueEligible({
        videoId: "abcdefghijk",
        title: "Secret",
        thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
        privacyStatus: "private",
      }),
      false,
    );
    assert.equal(
      isPublicCatalogueEligible({
        videoId: "abcdefghijk",
        title: "Hidden",
        thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
        privacyStatus: "public",
        hiddenFromSite: true,
      }),
      false,
    );
  });

  it("excludes missing thumbnail and missing title", () => {
    assert.equal(
      isPublicCatalogueEligible({
        videoId: "abcdefghijk",
        title: "Ok",
        thumbnailUrl: "",
      }),
      true,
      "youtube id alone can supply a thumbnail URL",
    );
    assert.equal(
      isPublicCatalogueEligible({
        videoId: "",
        title: "Ok",
        thumbnailUrl: "",
      }),
      false,
    );
    assert.equal(
      isPublicCatalogueEligible({
        videoId: "abcdefghijk",
        title: "   ",
        thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
      }),
      false,
    );
  });

  it("still lists unlinked recipes and incomplete chapters", () => {
    const card = toPublicVideoCard(
      row({
        videoId: "unlinked0001",
        recipeSlug: undefined,
        recipeTitle: undefined,
        description: "No chapters here",
      }),
    );
    assert.ok(card);
    assert.equal(card?.recipeSlug, undefined);
  });

  it("does not hide videos for admin metadata concerns", () => {
    assert.equal(
      isPublicCatalogueEligible({
        videoId: "metaissue01",
        title: "Needs timestamps in admin",
        thumbnailUrl: "https://i.ytimg.com/vi/metaissue01/hqdefault.jpg",
        privacyStatus: "public",
      }),
      true,
    );
  });

  it("never auto-features Shorts", () => {
    assert.equal(
      isPublicFeaturedEligible({
        videoId: "shortvideo1",
        title: "Quick tip #shorts",
        thumbnailUrl: "https://i.ytimg.com/vi/shortvideo1/hqdefault.jpg",
        privacyStatus: "public",
        format: "SHORT",
        embeddable: true,
      }),
      false,
    );
  });
});

describe("public video catalogue", () => {
  const longA = row({
    videoId: "longAAAAAAA",
    title: "You Won’t Believe This Caesar Dressing Is Homemade",
    publishedAt: new Date("2026-03-01T00:00:00.000Z"),
    durationSeconds: 380,
    recipeSlug: "homemade-chicken-caesar-salad",
    recipeTitle: "Homemade Chicken Caesar Salad with Garlic Croutons",
  });
  const longB = row({
    videoId: "longBBBBBBB",
    title: "Weeknight Skillet Pasta",
    publishedAt: new Date("2026-02-01T00:00:00.000Z"),
    durationSeconds: 420,
  });
  const privateLong = row({
    videoId: "privateLONG",
    title: "Private long",
    privacyStatus: "private",
    publishedAt: new Date("2026-04-01T00:00:00.000Z"),
    durationSeconds: 400,
  });
  const shortVideo = row({
    videoId: "shortSHORTS",
    title: "Garlic tip #shorts",
    description: "#shorts",
    publishedAt: new Date("2026-05-01T00:00:00.000Z"),
    durationSeconds: 45,
    durationDisplay: "0:45",
  });
  const noThumb = row({
    videoId: "",
    title: "Broken",
    thumbnailUrl: "",
  });

  it("selects latest eligible Long as featured and skips ineligible newer rows", () => {
    const catalogue = buildPublicVideoCatalogue([privateLong, longA, longB, shortVideo]);
    assert.equal(catalogue.featured?.videoId, "longAAAAAAA");
    assert.equal(catalogue.featured?.format, "LONG");
  });

  it("does not auto-feature a Short even when newest", () => {
    const catalogue = buildPublicVideoCatalogue([shortVideo, longB]);
    assert.equal(catalogue.featured?.videoId, "longBBBBBBB");
  });

  it("excludes featured video from the grid by videoId", () => {
    const catalogue = buildPublicVideoCatalogue([longA, longB]);
    assert.equal(catalogue.featured?.videoId, "longAAAAAAA");
    assert.ok(catalogue.videos.every((video) => video.videoId !== "longAAAAAAA"));
    assert.equal(catalogue.videos.length, 1);
    assert.equal(catalogue.videos[0]?.videoId, "longBBBBBBB");
    assert.deepEqual(
      excludeFeaturedFromGrid([...catalogue.videos, catalogue.featured!], catalogue.featured!.videoId).map(
        (v) => v.videoId,
      ),
      ["longBBBBBBB"],
    );
  });

  it("uses YouTube video titles and linked recipe titles separately", () => {
    const catalogue = buildPublicVideoCatalogue([longA]);
    assert.equal(
      catalogue.featured?.title,
      "You Won’t Believe This Caesar Dressing Is Homemade",
    );
    assert.equal(catalogue.featured?.recipeTitle, "Homemade Chicken Caesar Salad with Garlic Croutons");
    assert.equal(catalogue.featured?.recipeSlug, "homemade-chicken-caesar-salad");
  });

  it("omits recipe relationship when unlinked", () => {
    const catalogue = buildPublicVideoCatalogue([longB]);
    assert.equal(catalogue.featured?.recipeSlug, undefined);
    assert.equal(catalogue.featured?.recipeTitle, undefined);
  });

  it("filters out non-eligible source rows", () => {
    const catalogue = buildPublicVideoCatalogue([longA, noThumb, privateLong]);
    assert.equal(catalogue.longCount, 1);
  });

  it("keeps Shorts out of the Long grid and gates the format filter", () => {
    const fewShorts = buildPublicVideoCatalogue([longA, shortVideo]);
    assert.equal(fewShorts.showFormatFilter, false);
    assert.equal(fewShorts.shorts.length, 1);

    const manyShorts = buildPublicVideoCatalogue(
      [
        longA,
        ...[1, 2, 3, 4].map((n) =>
          row({
            videoId: `short00000${n}`,
            title: `Tip ${n} #shorts`,
            description: "#shorts",
            durationSeconds: 40,
            publishedAt: new Date(`2026-06-0${n}T00:00:00.000Z`),
          }),
        ),
      ],
      { shortsFilterMin: 4 },
    );
    assert.equal(manyShorts.showFormatFilter, true);
    assert.equal(manyShorts.shortCount, 4);
  });

  it("selectFeaturedPublicVideo prefers newest Long", () => {
    const cards = [longA, longB].map((r) => toPublicVideoCard(r)!);
    assert.equal(selectFeaturedPublicVideo(cards)?.videoId, "longAAAAAAA");
  });
});

describe("public video watch URL identity", () => {
  it("uses immutable YouTube videoId as the public route identity", () => {
    const card = toPublicVideoCard(row({ videoId: "67Laso4MggU" }));
    assert.equal(card?.videoId, "67Laso4MggU");
  });
});
