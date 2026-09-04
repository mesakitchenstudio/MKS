import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { seriesItemListJsonLd, type PublicSeriesDetail } from "./series-types";

const root = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(root, "../app/series/[slug]/page.tsx"), "utf8");
const seriesLib = readFileSync(path.join(root, "series.ts"), "utf8");
const subscribe = readFileSync(
  path.join(root, "../components/youtube/YouTubeSubscribeCTA.tsx"),
  "utf8",
);
const trackLink = readFileSync(
  path.join(root, "../components/series/SeriesItemTrackLink.tsx"),
  "utf8",
);
const recipeContinued = readFileSync(
  path.join(root, "../components/youtube/RecipeContinuedViewing.tsx"),
  "utf8",
);

function sampleSeries(overrides: Partial<PublicSeriesDetail> = {}): PublicSeriesDetail {
  return {
    id: "s1",
    slug: "breads",
    title: "Breads",
    shortTitle: "Breads",
    description: "A short series on bread baking.",
    intro: "Long intro.",
    heroImage: "/hero.jpg",
    seoTitle: "",
    seoDescription: "",
    youtubePlaylistId: "PLtest",
    youtubePlaylistUrl: "https://www.youtube.com/playlist?list=PLtest",
    itemCount: 2,
    featured: {
      id: "i1",
      position: 1,
      title: "Artisanal French Baguettes",
      description: "Crisp crust.",
      featured: true,
      thumbnail: "/baguette.jpg",
      recipeId: "r1",
      recipeSlug: "artisanal-french-baguettes",
      recipeTitle: "Artisanal French Baguettes",
      youtubeVideoId: "vid1",
      youtubeTitle: "Baguettes",
      durationDisplay: "7:39",
      watchUrl: "https://www.youtube.com/watch?v=vid1",
      typeName: "Bread",
      categorySlugs: ["breads"],
    },
    items: [
      {
        id: "i1",
        position: 1,
        title: "Artisanal French Baguettes",
        description: "Crisp crust.",
        featured: true,
        thumbnail: "/baguette.jpg",
        recipeId: "r1",
        recipeSlug: "artisanal-french-baguettes",
        recipeTitle: "Artisanal French Baguettes",
        youtubeVideoId: "vid1",
        youtubeTitle: "Baguettes",
        durationDisplay: "7:39",
        watchUrl: "https://www.youtube.com/watch?v=vid1",
        typeName: "Bread",
        categorySlugs: ["breads"],
      },
      {
        id: "i2",
        position: 2,
        title: "Why homemade bread isn't crusty",
        description: "",
        featured: false,
        thumbnail: "/why.jpg",
        recipeId: "r2",
        recipeSlug: "why-your-homemade-bread-isnt-crusty-and-how-to-fix-it",
        recipeTitle: "Why homemade bread isn't crusty",
        youtubeVideoId: null,
        youtubeTitle: null,
        durationDisplay: "",
        watchUrl: null,
        typeName: "Bread",
        categorySlugs: ["breads"],
      },
    ],
    ...overrides,
  };
}

describe("Series public Phase 2 presentation contracts", () => {
  it("marks the Phase 2 collection layout on the sole public Series detail route", () => {
    assert.match(page, /data-mesa-series-layout="phase2-collection"/);
    assert.match(page, /getPublishedSeriesBySlug/);
    assert.match(page, /export const revalidate = 300/);
    assert.match(page, /generateStaticParams/);
  });

  it("removes every legacy standalone Featured showcase marker from the Series page", () => {
    assert.doesNotMatch(page, /Watch playlist on YouTube/);
    assert.doesNotMatch(page, /Prefer binge-watching on YouTube/);
    assert.doesNotMatch(page, /bg-cream\/40 p-4 md:p-6/);
    assert.doesNotMatch(page, /md:grid-cols-\[minmax\(0,18rem\)_1fr\]/);
    assert.doesNotMatch(page, /featured\.thumbnail/);
    assert.doesNotMatch(page, /featured\.title/);
    assert.doesNotMatch(page, /featured\.recipeSlug/);
    assert.doesNotMatch(page, /featured\.watchUrl/);
    assert.doesNotMatch(page, /View recipe/);
    // Card labels use Watch video; recipe embeds may also say Watch video.
    assert.match(page, /Watch video/);
    assert.match(recipeContinued, /Watch video/);
  });

  it("keeps intro immediately followed by the In this series grid (no Featured section between)", () => {
    const introBlock = page.indexOf("series.intro");
    const gridHeading = page.indexOf("In this series");
    assert.ok(introBlock > 0 && gridHeading > introBlock);
    const between = page.slice(introBlock, gridHeading);
    assert.doesNotMatch(between, /SeriesItemTrackLink/);
    assert.doesNotMatch(between, /featured\.(thumbnail|title|recipeSlug|watchUrl)/);
    assert.doesNotMatch(between, /Watch playlist/);
    assert.match(page, /no standalone Featured showcase between intro and the item grid/);
  });

  it("marks the effective featured item via series.featured identity only inside the grid card", () => {
    assert.match(page, /series\.featured\?\.id/);
    assert.match(page, /effectiveFeaturedId === item\.id/);
    assert.doesNotMatch(page, /isEffectiveFeatured = item\.featured/);
    assert.match(
      page,
      /isEffectiveFeatured \? \([\s\S]*Featured[\s\S]*\) : null/,
    );
    assert.match(
      seriesLib,
      /const featured = items\.find\(\(i\) => i\.featured\) \|\| items\[0\] \|\| null/,
    );
  });

  it("renders every visible Series item exactly once inside the ordered grid", () => {
    assert.match(page, /series\.items\.map/);
    assert.match(page, /<ol[\s\S]*?className=\{itemGridClass\}/);
    assert.match(page, /data-mesa-series-grid=\{itemGridMode\}/);
    assert.doesNotMatch(page, /filter\(\(item\) => !item\.featured\)/);
    assert.doesNotMatch(page, /filter\(\(item\) => item\.id !==/);
    assert.equal((page.match(/series\.items\.map/g) || []).length, 1);
  });

  it("preserves per-item recipe and watch CTA combinations without a Featured CTA cluster", () => {
    assert.match(page, /item\.recipeSlug \? \([\s\S]*Read recipe/);
    assert.match(page, /item\.watchUrl \? \([\s\S]*Watch video/);
    assert.match(page, /event="series_item_click"/);
    assert.match(page, /event="series_watch_click"/);
    assert.equal((page.match(/event="series_item_click"/g) || []).length, 1);
    assert.equal((page.match(/event="series_watch_click"/g) || []).length, 1);
  });

  it("uses header + conclusion playlist placements for playlist-backed Series", () => {
    assert.match(page, /placement="series_page_header"/);
    assert.match(page, /SeriesContinueWithMesa/);
    assert.match(page, /SERIES_PLAYLIST_CTA_LABEL/);
    assert.doesNotMatch(page, /placement="series_page_footer"/);
    assert.equal((page.match(/series_watch_playlist_on_youtube_click/g) || []).length, 1);
  });

  it("keeps Series subscribe event parity without rewriting the shared Subscribe CTA API", () => {
    assert.match(page, /SeriesContinueWithMesa/);
    assert.match(subscribe, /placement\?: SubscribePlacement/);
    assert.match(subscribe, /Cook along with Mesa/);
    assert.match(subscribe, /recipe_youtube_subscribe_click/);
  });

  it("preserves ItemList JSON-LD and metadata wiring independent of Featured UI", () => {
    assert.match(page, /seriesItemListJsonLd\(series\)/);
    assert.match(page, /generateMetadata/);
    const series = sampleSeries();
    const json = seriesItemListJsonLd(series);
    assert.equal(json["@type"], "ItemList");
    assert.equal(json.numberOfItems, 2);
    const elements = json.itemListElement as Array<{ name?: string; position?: number }>;
    assert.equal(elements[0]?.name, "Artisanal French Baguettes");
    assert.equal(elements[1]?.position, 2);
  });

  it("preserves unpublished gating via notFound when series is missing", () => {
    assert.match(page, /if \(!series\) notFound\(\)/);
  });

  it("keeps SeriesItemTrackLink analytics wrappers for item and playlist actions", () => {
    assert.match(trackLink, /series_item_click/);
    assert.match(trackLink, /series_watch_click/);
    assert.match(trackLink, /series_watch_playlist_on_youtube_click/);
    assert.match(page, /SeriesItemTrackLink/);
  });

  it("keeps hero and top hierarchy intact with a capped large-desktop height", () => {
    assert.match(page, /Cooking Series/);
    assert.match(page, /series\.heroImage/);
    assert.match(page, /aspect-video/);
    assert.match(page, /xl:aspect-auto xl:h-\[30rem\]/);
    assert.match(page, /object-cover object-center/);
    assert.match(page, /series\.intro/);
    assert.match(page, /formatSeriesCollectionMeta/);
    assert.match(page, /max-w-6xl/);
    assert.match(page, /visibleItemCount === 2/);
    assert.match(page, /sm:grid-cols-2 lg:grid-cols-3/);
    assert.match(page, /max-w-\[72ch\]/);
    // Guard against restoring an unrestricted large-desktop 16:9-only hero wrapper.
    assert.doesNotMatch(
      page,
      /relative mt-8 aspect-video overflow-hidden border border-line bg-sand">/,
    );
  });
});
