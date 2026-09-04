import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { seriesItemListJsonLd, type PublicSeriesItem } from "./series-types";
import {
  formatSeriesCollectionMeta,
  parseDurationDisplay,
  seriesVisibleVideoDurationTotalSeconds,
} from "./series-public-meta";
import { mapSourceToPlacement } from "./funnel-analytics";

const root = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(root, "../app/series/[slug]/page.tsx"), "utf8");
const conclusion = readFileSync(
  path.join(root, "../components/series/SeriesContinueWithMesa.tsx"),
  "utf8",
);
const trackLink = readFileSync(
  path.join(root, "../components/series/SeriesItemTrackLink.tsx"),
  "utf8",
);
const subscribe = readFileSync(
  path.join(root, "../components/youtube/YouTubeSubscribeCTA.tsx"),
  "utf8",
);

function item(
  partial: Partial<PublicSeriesItem> & Pick<PublicSeriesItem, "id" | "title">,
): PublicSeriesItem {
  return {
    position: 1,
    description: "",
    featured: false,
    thumbnail: "/t.jpg",
    recipeId: null,
    recipeSlug: null,
    recipeTitle: null,
    youtubeVideoId: null,
    youtubeTitle: null,
    durationDisplay: "",
    watchUrl: null,
    typeName: "",
    categorySlugs: [],
    ...partial,
  };
}

describe("Series public Phase 3 conversion + metadata", () => {
  it("keeps Phase 2 collection architecture without a standalone Featured showcase", () => {
    assert.match(page, /data-mesa-series-layout="phase2-collection"/);
    assert.doesNotMatch(page, /featured\.thumbnail|featured\.title/);
    assert.doesNotMatch(page, /bg-cream\/40 p-4 md:p-6/);
    assert.match(page, /effectiveFeaturedId === item\.id/);
    assert.equal((page.match(/series\.items\.map/g) || []).length, 1);
  });

  it("editorializes Series count and only emits TOTAL when all video durations are reliable", () => {
    assert.equal(parseDurationDisplay("7:39"), 7 * 60 + 39);
    assert.equal(parseDurationDisplay("1:04:12"), 3600 + 4 * 60 + 12);
    assert.equal(parseDurationDisplay(""), null);
    assert.equal(parseDurationDisplay("bad"), null);

    const bothVideos = [
      item({
        id: "a",
        title: "A",
        youtubeVideoId: "v1",
        watchUrl: "https://youtu.be/v1",
        durationDisplay: "7:39",
      }),
      item({
        id: "b",
        title: "B",
        youtubeVideoId: "v2",
        watchUrl: "https://youtu.be/v2",
        durationDisplay: "4:21",
      }),
    ];
    assert.equal(seriesVisibleVideoDurationTotalSeconds(bothVideos), 7 * 60 + 39 + 4 * 60 + 21);
    assert.equal(formatSeriesCollectionMeta(bothVideos), "2-PART SERIES · 12 MIN TOTAL");

    const missingDuration = [
      item({
        id: "a",
        title: "A",
        youtubeVideoId: "v1",
        watchUrl: "https://youtu.be/v1",
        durationDisplay: "7:39",
      }),
      item({
        id: "b",
        title: "B",
        youtubeVideoId: "v2",
        watchUrl: "https://youtu.be/v2",
        durationDisplay: "",
      }),
    ];
    assert.equal(seriesVisibleVideoDurationTotalSeconds(missingDuration), null);
    assert.equal(formatSeriesCollectionMeta(missingDuration), "2-PART SERIES");

    const recipeOnlyPlusVideo = [
      item({
        id: "a",
        title: "A",
        recipeSlug: "a",
        recipeId: "r1",
      }),
      item({
        id: "b",
        title: "B",
        youtubeVideoId: "v2",
        watchUrl: "https://youtu.be/v2",
        durationDisplay: "10:00",
      }),
    ];
    assert.equal(formatSeriesCollectionMeta(recipeOnlyPlusVideo), "2-PART SERIES · 10 MIN TOTAL");
    assert.equal(formatSeriesCollectionMeta([item({ id: "x", title: "Solo" })]), "1-PART SERIES");

    assert.match(page, /formatSeriesCollectionMeta\(series\.items\)/);
  });

  it("exposes header and conclusion playlist CTAs for playlist-backed Series only", () => {
    assert.match(page, /placement="series_page_header"/);
    assert.match(conclusion, /placement="series_page_conclusion"/);
    assert.equal((page.match(/series_watch_playlist_on_youtube_click/g) || []).length, 1);
    assert.equal((conclusion.match(/series_watch_playlist_on_youtube_click/g) || []).length, 1);
    assert.match(page, /series\.youtubePlaylistUrl \?/);
    assert.match(conclusion, /youtubePlaylistUrl \?/);
    assert.doesNotMatch(page, /placement="series_page_footer"/);
    assert.equal(mapSourceToPlacement("series_page_header"), "series_page");
    assert.equal(mapSourceToPlacement("series_page_conclusion"), "series_page");
  });

  it("uses Read recipe / Watch video labels with accessible names", () => {
    assert.match(page, />\s*Read recipe\s*</);
    assert.match(page, />\s*Watch video/);
    assert.doesNotMatch(page, />\s*View recipe\s*</);
    assert.doesNotMatch(page, />\s*Watch\s*</);
    assert.match(page, /ariaLabel=\{`Read recipe: \$\{item\.title\}`\}/);
    assert.match(page, /ariaLabel=\{`Watch video: \$\{item\.title\} \(opens in a new tab\)`\}/);
    assert.match(page, /item\.recipeSlug \?/);
    assert.match(page, /item\.watchUrl \?/);
  });

  it("composes a Series-specific conclusion without regressing shared Subscribe CTA", () => {
    assert.match(page, /SeriesContinueWithMesa/);
    assert.match(conclusion, /Continue with Mesa/);
    assert.match(conclusion, /Cook along with Mesa/);
    assert.match(conclusion, /recipe_youtube_subscribe_click/);
    assert.match(conclusion, /source: "series_page"/);
    assert.match(conclusion, /data-mesa-series-conclusion="continue-with-mesa"/);
    assert.doesNotMatch(page, /YouTubeSubscribeCTA/);
    assert.match(subscribe, /placement\?: SubscribePlacement/);
    assert.match(subscribe, /post_video_subscribe/);
  });

  it("tightens hero-to-intro rhythm and keeps a readable intro measure", () => {
    assert.match(page, /mt-6 max-w-\[72ch\]/);
    assert.match(page, /section className="mt-10"/);
    assert.match(page, /xl:h-\[30rem\]/);
  });

  it("avoids early desktop layout breakpoints for metadata and conclusion actions", () => {
    assert.match(page, /sm:flex-row sm:flex-wrap sm:items-center/);
    assert.match(conclusion, /sm:flex-row sm:flex-wrap sm:items-center/);
    assert.doesNotMatch(page, /md:flex-row.*series_page_header|lg:flex-row.*playlist/);
    // Conclusion text/actions split only at xl (conservative vs tablet content width).
    assert.match(conclusion, /xl:flex-row xl:items-end xl:justify-between/);
    assert.doesNotMatch(conclusion, /md:flex-row|lg:flex-row/);
  });

  it("preserves ItemList JSON-LD and item analytics event names", () => {
    assert.match(page, /seriesItemListJsonLd\(series\)/);
    assert.match(trackLink, /series_item_click/);
    assert.match(trackLink, /series_watch_click/);
    assert.match(trackLink, /series_watch_playlist_on_youtube_click/);
    const json = seriesItemListJsonLd({
      id: "s1",
      slug: "breads",
      title: "Breads",
      shortTitle: "",
      description: "d",
      intro: "",
      heroImage: "",
      seoTitle: "",
      seoDescription: "",
      youtubePlaylistId: null,
      youtubePlaylistUrl: null,
      itemCount: 1,
      featured: null,
      items: [
        item({
          id: "i1",
          title: "Artisanal French Baguettes",
          recipeSlug: "artisanal-french-baguettes",
          position: 1,
        }),
      ],
    });
    assert.equal(json["@type"], "ItemList");
    assert.equal(json.numberOfItems, 1);
  });
});
