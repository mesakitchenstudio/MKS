import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  funnelPayloadFromAnalyticsDetail,
  mapClientEventToFunnelName,
  mapSourceToPlacement,
  isFunnelEventName,
} from "./funnel-analytics.ts";
import {
  publicMesaWatchPath,
  resolvePublicVideoDiscoveryHref,
} from "./public-videos/watch-route.ts";
import { seriesItemListJsonLd, type PublicSeriesDetail } from "./series-types.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

describe("phase 5B — canonical Mesa watch routes", () => {
  it("builds /videos/[videoId] only for valid 11-char IDs", () => {
    assert.equal(publicMesaWatchPath("abcdefghijk"), "/videos/abcdefghijk");
    assert.equal(publicMesaWatchPath("bad"), null);
    assert.equal(publicMesaWatchPath(""), null);
    assert.equal(publicMesaWatchPath("../../../etc"), null);
  });

  it("prefers Mesa watch for catalogue-eligible videos and keeps external fallback", () => {
    assert.deepEqual(
      resolvePublicVideoDiscoveryHref({
        videoId: "abcdefghijk",
        catalogueEligible: true,
        youtubeWatchUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      }),
      { href: "/videos/abcdefghijk", external: false },
    );
    assert.deepEqual(
      resolvePublicVideoDiscoveryHref({
        videoId: "abcdefghijk",
        catalogueEligible: false,
        youtubeWatchUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      }),
      { href: "https://www.youtube.com/watch?v=abcdefghijk", external: true },
    );
    assert.equal(
      resolvePublicVideoDiscoveryHref({
        videoId: "not-a-real-id",
        catalogueEligible: true,
      }),
      null,
      "invalid IDs never gain a Mesa watch path even if marked eligible",
    );
  });

  it("wires hub / featured / More from Mesa through Mesa watch paths", () => {
    const featured = read("components/youtube/PublicFeaturedVideo.tsx");
    const card = read("components/youtube/PublicVideoCard.tsx");
    assert.match(featured, /const watchHref = `\/videos\/\$\{video\.videoId\}`/);
    assert.match(card, /const watchHref = `\/videos\/\$\{video\.videoId\}`/);
    assert.doesNotMatch(featured, /youtube\.com\/watch/);
    assert.doesNotMatch(card, /youtube\.com\/watch/);
  });

  it("keeps Recipe instructional playback on the Recipe modal path", () => {
    const watchMethod = read("components/youtube/RecipeWatchMethod.tsx");
    const hero = read("components/RecipePageHeroActions.tsx");
    const cook = read("components/cooking/CookingMode.tsx");
    assert.match(watchMethod, /expandWatchMethod|RecipeVideo/);
    assert.doesNotMatch(watchMethod, /\/videos\/\$\{/);
    assert.doesNotMatch(hero, /href=\{`\/videos\//);
    assert.doesNotMatch(cook, /href=\{`\/videos\//);
  });
});

describe("phase 5B — Editorial Collection video discovery", () => {
  it("maps Series watch destinations through catalogue eligibility helper", () => {
    const seriesLib = read("lib/series.ts");
    const page = read("components/series/SeriesDetailView.tsx");
    assert.match(seriesLib, /resolvePublicVideoDiscoveryHref/);
    assert.match(seriesLib, /isSyncedVideoCatalogueEligible/);
    assert.match(seriesLib, /watchExternal/);
    assert.match(page, /external=\{item\.watchExternal\}/);
  });

  it("uses absolute Mesa watch URLs in Series ItemList JSON-LD when internal", () => {
    const series: PublicSeriesDetail = {
      id: "s1",
      slug: "breads",
      title: "Breads",
      shortTitle: "Breads",
      description: "",
      intro: "",
      heroImage: "",
      seoTitle: "",
      seoDescription: "",
      youtubePlaylistId: null,
      youtubePlaylistUrl: null,
      itemCount: 1,
      featured: null,
      items: [
        {
          id: "i1",
          position: 1,
          title: "Flatbread video",
          description: "",
          featured: false,
          thumbnail: "/t.jpg",
          recipeId: null,
          recipeSlug: null,
          recipeTitle: null,
          youtubeVideoId: "abcdefghijk",
          youtubeTitle: "Flatbread",
          durationDisplay: "6:00",
          watchUrl: "/videos/abcdefghijk",
          watchExternal: false,
          typeName: "",
          categorySlugs: [],
          primaryCategoryLabel: "",
          totalTimeMinutes: null,
        },
      ],
    };
    const json = seriesItemListJsonLd(series);
    const first = (json.itemListElement as Array<{ url?: string }>)[0];
    assert.match(first.url || "", /\/videos\/abcdefghijk$/);
    assert.doesNotMatch(first.url || "", /youtube\.com/);
  });

  it("does not introduce N+1 catalogue loads on Series detail", () => {
    const seriesLib = read("lib/series.ts");
    // Eligibility is computed from already-joined youtubeVideo rows in mapSeriesItem.
    assert.match(seriesLib, /isSyncedVideoCatalogueEligible/);
    assert.doesNotMatch(seriesLib, /loadPublicVideoCatalogue/);
    assert.doesNotMatch(seriesLib, /loadPublicVideoWatch/);
  });
});

describe("phase 5B — video_to_recipe conversion analytics", () => {
  it("owns Video→Recipe via videos_recipe_click → FunnelEvent video_to_recipe", () => {
    assert.equal(mapClientEventToFunnelName("videos_recipe_click"), "video_to_recipe");
    assert.ok(isFunnelEventName("video_to_recipe"));
    assert.equal(mapClientEventToFunnelName("recipe_video_play"), "recipe_video_play");
    assert.notEqual(
      mapClientEventToFunnelName("videos_recipe_click"),
      mapClientEventToFunnelName("recipe_video_play"),
    );
  });

  it("maps video surface placements without dual-writing a second client event", () => {
    assert.equal(mapSourceToPlacement("featured"), "videos_featured");
    assert.equal(mapSourceToPlacement("full_grid"), "videos_card");
    assert.equal(mapSourceToPlacement("shorts_grid"), "videos_card");
    assert.equal(mapSourceToPlacement("watch_page"), "videos_watch");

    const payload = funnelPayloadFromAnalyticsDetail({
      event: "videos_recipe_click",
      video_id: "abcdefghijk",
      recipe_slug: "soft-stovetop-flatbread",
      recipe_title: "Soft Stovetop Flatbread",
      placement: "watch_page",
      source: "LONG",
    });
    assert.ok(payload);
    assert.equal(payload?.name, "video_to_recipe");
    assert.equal(payload?.youtubeVideoId, "abcdefghijk");
    assert.equal(payload?.recipeSlug, "soft-stovetop-flatbread");
    assert.equal(payload?.placement, "videos_watch");
  });

  it("fires conversion only from intentional Recipe clicks on hub and watch", () => {
    const featured = read("components/youtube/PublicFeaturedVideo.tsx");
    const card = read("components/youtube/PublicVideoCard.tsx");
    const watchCta = read("components/youtube/PublicWatchRecipeCta.tsx");
    const watchPage = read("app/videos/[videoId]/page.tsx");

    assert.match(featured, /videos_recipe_click/);
    assert.match(card, /videos_recipe_click/);
    assert.match(watchCta, /videos_recipe_click/);
    assert.match(watchCta, /placement: "watch_page"/);
    assert.match(watchPage, /PublicWatchRecipeCta/);
    assert.doesNotMatch(watchCta, /useEffect/);
    assert.doesNotMatch(featured, /videos_recipe_click[\s\S]*useEffect/);
  });

  it("keeps Watch and Recipe click events distinct", () => {
    const featured = read("components/youtube/PublicFeaturedVideo.tsx");
    const card = read("components/youtube/PublicVideoCard.tsx");
    assert.match(featured, /videos_featured_click/);
    assert.match(featured, /videos_recipe_click/);
    assert.match(card, /videos_card_click/);
    assert.match(card, /videos_recipe_click/);
    assert.match(featured, /trackFeaturedClick[\s\S]*videos_featured_click/);
    assert.match(featured, /trackRecipeClick[\s\S]*videos_recipe_click/);
  });
});

describe("phase 5B — chapters deferred; Start Cooking deferred", () => {
  it("does not add a second chapter parser or watch-page chapter UI in 5B", () => {
    const watchPage = read("app/videos/[videoId]/page.tsx");
    const player = read("components/youtube/PublicWatchPlayer.tsx");
    assert.doesNotMatch(watchPage, /Recipe steps in this video|chapter/i);
    assert.doesNotMatch(player, /startSeconds/);
    assert.doesNotMatch(watchPage, /Start Cooking/);
  });
});

describe("phase 5B — UNKNOWN classifier not weakened", () => {
  it("keeps UNKNOWN out of typed hub grids", () => {
    const eligibility = read("lib/public-videos/eligibility.ts");
    assert.match(eligibility, /UNKNOWN is deliberately excluded/);
    assert.match(eligibility, /return format === "LONG"/);
    assert.match(eligibility, /return format === "SHORT"/);
  });
});
