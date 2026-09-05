import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildPublicVideoCatalogue,
  excludeFeaturedFromGrid,
  selectFeaturedPublicVideo,
} from "./catalogue.ts";
import {
  isFullPublicVideo,
  isPublicCatalogueEligible,
  isPublicFeaturedEligible,
  isShortPublicVideo,
  toPublicVideoCard,
} from "./eligibility.ts";
import { classifyYouTubeVideoFormat } from "@/lib/youtube-data/video-format";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import type { PublicVideoSourceRow } from "./types.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..", "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

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

  it("treats Full as LONG only and Shorts as SHORT only", () => {
    assert.equal(isFullPublicVideo("LONG"), true);
    assert.equal(isFullPublicVideo("UNKNOWN"), false);
    assert.equal(isFullPublicVideo("SHORT"), false);
    assert.equal(isShortPublicVideo("SHORT"), true);
    assert.equal(isShortPublicVideo("UNKNOWN"), false);
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
  const unmarkedShort = row({
    videoId: "BodG55anvjs",
    title: "Chocolate donut short 2026 19 08",
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    durationSeconds: 68,
    durationDisplay: "1:08",
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
    assert.ok(fewShorts.videos.every((video) => video.format === "LONG"));

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

  it("moves unmarked ≤90s clips into Shorts and out of Full", () => {
    const catalogue = buildPublicVideoCatalogue([longA, unmarkedShort]);
    assert.equal(classifyYouTubeVideoFormat(unmarkedShort), "SHORT");
    assert.ok(catalogue.videos.every((video) => video.videoId !== "BodG55anvjs"));
    assert.ok(catalogue.shorts.some((video) => video.videoId === "BodG55anvjs"));
  });

  it("never features a Short and keeps Full / Shorts arrays separated", () => {
    const catalogue = buildPublicVideoCatalogue([unmarkedShort, shortVideo, longB]);
    assert.equal(catalogue.featured?.format, "LONG");
    assert.ok(catalogue.videos.every((video) => video.format === "LONG"));
    assert.ok(catalogue.shorts.every((video) => video.format === "SHORT"));
  });

  it("selectFeaturedPublicVideo prefers newest Long", () => {
    const cards = [longA, longB].map((r) => toPublicVideoCard(r)!);
    assert.equal(selectFeaturedPublicVideo(cards)?.videoId, "longAAAAAAA");
  });
});

describe("recipe link editorial identity", () => {
  it("prefers trustworthy dishName then falls back to title", () => {
    assert.equal(
      resolveRecipeCardTitle({
        title: "I Make This Creamy Mushroom Pasta 3 Times a Week! 😋",
        dishName: "Creamy Mushroom Pasta",
      }),
      "Creamy Mushroom Pasta",
    );
    assert.equal(
      resolveRecipeCardTitle({
        title: "Classic French Baguettes",
        dishName: "",
      }),
      "Classic French Baguettes",
    );
  });

  it("wires dishName preference into the recipe video index join", () => {
    const matching = read("lib/youtube-data/matching.ts");
    assert.match(matching, /resolveRecipeCardTitle/);
    assert.match(matching, /readEditorialDishName/);
    assert.match(matching, /recipeTitle: recipe\.displayTitle/);
  });
});

describe("public videos UI wiring", () => {
  it("uses Featured video eyebrow and Full videos heading copy", () => {
    const featured = read("components/youtube/PublicFeaturedVideo.tsx");
    const catalogue = read("components/youtube/PublicVideosCatalogue.tsx");
    assert.match(featured, /Featured video/);
    assert.doesNotMatch(featured, /From the kitchen/);
    assert.match(featured, /Watch video →/);
    assert.match(catalogue, /sectionHeading = format === "shorts" \? "Shorts" : "Full videos"/);
    assert.doesNotMatch(catalogue, /All videos/);
  });

  it("polishes featured and grid typography without rewriting titles", () => {
    const featured = read("components/youtube/PublicFeaturedVideo.tsx");
    const card = read("components/youtube/PublicVideoCard.tsx");
    assert.match(featured, /md:text-\[1\.95rem\]/);
    assert.match(card, /line-clamp-3/);
    assert.match(card, /md:text-\[1\.15rem\]/);
  });

  it("treats Shorts as a portrait shelf without changing Full videos cards", () => {
    const card = read("components/youtube/PublicVideoCard.tsx");
    const catalogue = read("components/youtube/PublicVideosCatalogue.tsx");
    const thumb = read("components/youtube/VideoThumbnail.tsx");
    assert.match(card, /aspect-\[3\/4\] lg:aspect-\[9\/16\]/);
    assert.match(card, /line-clamp-2/);
    assert.match(card, /playSize=\{portrait \? "sm" : "md"\}/);
    assert.match(card, /placement: portrait \? "shorts_grid" : "full_grid"/);
    assert.match(card, /source: video\.format/);
    assert.match(catalogue, /lg:grid-cols-4/);
    assert.match(catalogue, /format === "shorts"[\s\S]*mt-10 border-t/);
    assert.match(thumb, /playSize/);
    assert.match(thumb, /objectPositionClassName/);
  });

  it("closes the catalogue with an editorial Mesa on YouTube section", () => {
    const catalogue = read("components/youtube/PublicVideosCatalogue.tsx");
    assert.match(catalogue, /Mesa on YouTube/);
    assert.match(catalogue, /Cook along with Mesa/);
    assert.match(catalogue, /Visit Mesa on YouTube →/);
    assert.match(catalogue, /videos_catalog_footer/);
    assert.doesNotMatch(catalogue, /More from Mesa on YouTube/);
  });

  it("clamps card titles and fires live catalogue analytics", () => {
    const card = read("components/youtube/PublicVideoCard.tsx");
    const featured = read("components/youtube/PublicFeaturedVideo.tsx");
    const catalogue = read("components/youtube/PublicVideosCatalogue.tsx");
    const outbound = read("components/youtube/VideosYoutubeOutboundLink.tsx");
    assert.match(card, /line-clamp-3/);
    assert.match(card, /videos_card_click/);
    assert.match(card, /videos_recipe_click/);
    assert.match(featured, /videos_featured_click/);
    assert.match(catalogue, /videos_format_change/);
    assert.match(catalogue, /VideosYoutubeOutboundLink/);
    assert.match(outbound, /videos_youtube_outbound_click/);
  });

  it("labels watch-page format without treating UNKNOWN as Full video", () => {
    const watch = read("app/videos/[videoId]/page.tsx");
    assert.match(
      watch,
      /video\.format === "SHORT" \? "Short" : video\.format === "LONG" \? "Full video" : "Video"/,
    );
  });
});

describe("public video watch URL identity", () => {
  it("uses immutable YouTube videoId as the public route identity", () => {
    const card = toPublicVideoCard(row({ videoId: "67Laso4MggU" }));
    assert.equal(card?.videoId, "67Laso4MggU");
  });
});
