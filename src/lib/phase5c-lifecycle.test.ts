/**
 * Phase 5C — Video Experience cross-system regression / fixture verification.
 *
 * Real local synced YouTubeVideo inventory may be empty; fixtures below are the
 * authoritative verification surface for catalogue/hub/watch/Series/analytics
 * contracts. Real-catalogue smoke is reported separately when DB has rows.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildPublicVideoCatalogue,
  selectFeaturedPublicVideo,
  selectMoreFromMesa,
} from "./public-videos/catalogue.ts";
import { summarizePublicVideoDescription } from "./public-videos/description.ts";
import {
  isFullPublicVideo,
  isPublicCatalogueEligible,
  isShortPublicVideo,
  PUBLIC_SHORTS_FILTER_MIN,
  toPublicVideoCard,
} from "./public-videos/eligibility.ts";
import {
  publicMesaWatchPath,
  resolvePublicVideoDiscoveryHref,
} from "./public-videos/watch-route.ts";
import type { PublicVideoSourceRow } from "./public-videos/types.ts";
import { classifyYouTubeVideoFormat } from "./youtube-data/video-format.ts";
import {
  funnelPayloadFromAnalyticsDetail,
  mapClientEventToFunnelName,
  mapSourceToPlacement,
} from "./funnel-analytics.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

function row(
  partial: Partial<PublicVideoSourceRow> & Pick<PublicVideoSourceRow, "videoId" | "title">,
): PublicVideoSourceRow {
  return {
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

/** Representative Phase 5C fixture catalogue (isolated — no real editorial mutation). */
const FIXTURE = {
  longLinked: row({
    videoId: "longLinked1",
    title: "Soft Stovetop Flatbread Method",
    durationSeconds: 420,
    publishedAt: new Date("2026-08-01T00:00:00.000Z"),
    description: "A simple stovetop flatbread with a soft, flexible crumb.\n\n0:00 Intro\n#shorts",
    recipeSlug: "soft-stovetop-flatbread",
    recipeTitle: "Soft Stovetop Flatbread",
  }),
  longUnlinked: row({
    videoId: "longUnlink2",
    title: "Kitchen lighting walkthrough",
    durationSeconds: 510,
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    description: "Studio lighting notes for filming bread.",
  }),
  shortLinked: row({
    videoId: "shortLink03",
    title: "Garlic tip #shorts",
    description: "#shorts",
    durationSeconds: 42,
    durationDisplay: "0:42",
    publishedAt: new Date("2026-08-10T00:00:00.000Z"),
    recipeSlug: "garlic-oil",
    recipeTitle: "Garlic Oil",
  }),
  shortUnlinked: row({
    videoId: "shortUnlnk4",
    title: "Quick fold tip #shorts",
    description: "#shorts",
    durationSeconds: 35,
    durationDisplay: "0:35",
    publishedAt: new Date("2026-08-11T00:00:00.000Z"),
  }),
  unknownEligible: row({
    videoId: "unknownElg1",
    title: "Studio camera check",
    description: "Camera test take",
    durationSeconds: 120,
    durationDisplay: "2:00",
    publishedAt: new Date("2026-06-01T00:00:00.000Z"),
  }),
  nonEmbeddable: row({
    videoId: "nonEmbedd01",
    title: "Restricted embed baguette",
    durationSeconds: 400,
    publishedAt: new Date("2026-05-01T00:00:00.000Z"),
    embeddable: false,
    recipeSlug: "classic-french-baguettes",
    recipeTitle: "Classic French Baguettes",
  }),
  weakDescription: row({
    videoId: "weakDesc001",
    title: "Weeknight pasta tip",
    durationSeconds: 390,
    publishedAt: new Date("2026-04-01T00:00:00.000Z"),
    description: "#pasta #mesa https://youtu.be/abcdefghijk",
  }),
  privateVideo: row({
    videoId: "privateVID1",
    title: "Private draft clip",
    privacyStatus: "private",
    durationSeconds: 300,
  }),
} as const;

const ALL_FIXTURES = Object.values(FIXTURE);

describe("phase 5C — architectural invariants", () => {
  it("keeps YouTubeVideo loaders as the sole live public catalogue path", () => {
    const load = read("lib/public-videos/load.ts");
    const hub = read("app/videos/page.tsx");
    const watch = read("app/videos/[videoId]/page.tsx");
    assert.match(load, /db\.youTubeVideo/);
    assert.match(hub, /loadPublicVideoCatalogue/);
    assert.match(watch, /loadPublicVideoWatchPage|loadPublicVideoWatch/);
    assert.doesNotMatch(hub, /videos-page|data\/videos/);
    assert.doesNotMatch(watch, /videos-page|data\/videos/);
  });

  it("keeps deferred contracts: no watch chapters and no Start Cooking", () => {
    const watch = read("app/videos/[videoId]/page.tsx");
    const player = read("components/youtube/PublicWatchPlayer.tsx");
    assert.doesNotMatch(watch, /Start Cooking/);
    assert.doesNotMatch(watch, /Recipe steps in this video|chapterList|seekTo/i);
    assert.doesNotMatch(player, /startSeconds/);
  });

  it("documents one videos_recipe_click → video_to_recipe owner with three emitters", () => {
    assert.equal(mapClientEventToFunnelName("videos_recipe_click"), "video_to_recipe");
    assert.equal(mapClientEventToFunnelName("recipe_video_play"), "recipe_video_play");
    const emitters = [
      read("components/youtube/PublicFeaturedVideo.tsx"),
      read("components/youtube/PublicVideoCard.tsx"),
      read("components/youtube/PublicWatchRecipeCta.tsx"),
    ];
    for (const source of emitters) {
      assert.match(source, /videos_recipe_click/);
    }
    assert.equal(mapSourceToPlacement("featured"), "videos_featured");
    assert.equal(mapSourceToPlacement("full_grid"), "videos_card");
    assert.equal(mapSourceToPlacement("watch_page"), "videos_watch");
  });
});

describe("phase 5C — representative catalogue fixtures", () => {
  it("classifies LONG / SHORT / UNKNOWN without weakening the classifier", () => {
    assert.equal(classifyYouTubeVideoFormat(FIXTURE.longLinked), "LONG");
    assert.equal(classifyYouTubeVideoFormat(FIXTURE.shortLinked), "SHORT");
    assert.equal(classifyYouTubeVideoFormat(FIXTURE.unknownEligible), "UNKNOWN");
    assert.equal(isFullPublicVideo("UNKNOWN"), false);
    assert.equal(isShortPublicVideo("UNKNOWN"), false);
  });

  it("applies eligibility independently of format and embeddability", () => {
    assert.equal(isPublicCatalogueEligible(FIXTURE.longLinked), true);
    assert.equal(isPublicCatalogueEligible(FIXTURE.unknownEligible), true);
    assert.equal(isPublicCatalogueEligible(FIXTURE.nonEmbeddable), true);
    assert.equal(isPublicCatalogueEligible(FIXTURE.privateVideo), false);
    const nonEmbedCard = toPublicVideoCard(FIXTURE.nonEmbeddable);
    assert.equal(nonEmbedCard?.embeddable, false);
    assert.equal(nonEmbedCard?.format, "LONG");
  });

  it("maps linked vs unlinked Recipe relationships explicitly", () => {
    const linked = toPublicVideoCard(FIXTURE.longLinked);
    const unlinked = toPublicVideoCard(FIXTURE.longUnlinked);
    assert.equal(linked?.recipeSlug, "soft-stovetop-flatbread");
    assert.equal(unlinked?.recipeSlug, undefined);
    assert.equal(unlinked?.recipeTitle, undefined);
  });

  it("summarizes descriptions safely and drops script/URL/hashtag noise", () => {
    const dirty = summarizePublicVideoDescription(
      '<script>alert(1)</script>\nA calm dough rest builds flavour overnight.\nhttps://evil.test/x\n#bread #mesa',
    );
    assert.ok(dirty);
    assert.doesNotMatch(dirty || "", /<script>|evil\.test|#bread/i);
    assert.equal(summarizePublicVideoDescription(FIXTURE.weakDescription.description), undefined);
    assert.match(
      summarizePublicVideoDescription(FIXTURE.longLinked.description) || "",
      /soft, flexible crumb/i,
    );
  });

  it("builds hub catalogue with Featured, LONG grid, Shorts, UNKNOWN exclusion", () => {
    const catalogue = buildPublicVideoCatalogue(ALL_FIXTURES);
    assert.equal(catalogue.featured?.videoId, "longLinked1");
    assert.ok(catalogue.videos.every((v) => v.format === "LONG"));
    assert.ok(catalogue.videos.every((v) => v.videoId !== catalogue.featured?.videoId));
    assert.ok(catalogue.shorts.every((v) => v.format === "SHORT"));
    assert.ok(catalogue.videos.every((v) => v.videoId !== "unknownElg1"));
    assert.ok(catalogue.shorts.every((v) => v.videoId !== "unknownElg1"));
    // UNKNOWN remains watchable as a card if eligible
    assert.ok(toPublicVideoCard(FIXTURE.unknownEligible));
  });

  it("gates Shorts filter at PUBLIC_SHORTS_FILTER_MIN while keeping Shorts visible", () => {
    assert.equal(PUBLIC_SHORTS_FILTER_MIN, 4);
    const few = buildPublicVideoCatalogue([FIXTURE.longLinked, FIXTURE.shortLinked, FIXTURE.shortUnlinked]);
    assert.equal(few.showFormatFilter, false);
    assert.ok(few.shorts.length >= 1);

    const manyShorts = buildPublicVideoCatalogue([
      FIXTURE.longLinked,
      ...[1, 2, 3, 4].map((n) =>
        row({
          videoId: `shortMany00${n}`,
          title: `Tip ${n} #shorts`,
          description: "#shorts",
          durationSeconds: 30,
          publishedAt: new Date(`2026-09-0${n}T00:00:00.000Z`),
        }),
      ),
    ]);
    assert.equal(manyShorts.showFormatFilter, true);
    assert.equal(manyShorts.shortCount, 4);
  });

  it("prefers embeddable Featured when dates tie", () => {
    const a = toPublicVideoCard(
      row({
        videoId: "featEmbed001",
        title: "Embeddable long",
        durationSeconds: 400,
        publishedAt: new Date("2026-09-01T00:00:00.000Z"),
        embeddable: true,
      }),
    )!;
    const b = toPublicVideoCard(
      row({
        videoId: "featNoEmb002",
        title: "Non-embed long",
        durationSeconds: 400,
        publishedAt: new Date("2026-09-01T00:00:00.000Z"),
        embeddable: false,
      }),
    )!;
    assert.equal(selectFeaturedPublicVideo([b, a])?.videoId, "featEmbed001");
  });

  it("builds More from Mesa same-format-first and excludes current", () => {
    const cards = ALL_FIXTURES.map((r) => toPublicVideoCard(r)).filter(Boolean) as NonNullable<
      ReturnType<typeof toPublicVideoCard>
    >[];
    const more = selectMoreFromMesa(cards, "longLinked1", "LONG", 4);
    assert.ok(more.every((c) => c.videoId !== "longLinked1"));
    assert.equal(more[0]?.format, "LONG");
    assert.ok(more.length <= 4);
  });
});

describe("phase 5C — discovery routing contracts", () => {
  it("routes catalogue-eligible Series videos to Mesa watch", () => {
    assert.deepEqual(
      resolvePublicVideoDiscoveryHref({
        videoId: "longLinked1",
        catalogueEligible: true,
        youtubeWatchUrl: "https://www.youtube.com/watch?v=longLinked1",
      }),
      { href: "/videos/longLinked1", external: false },
    );
  });

  it("keeps noncatalogue Series videos on external YouTube", () => {
    assert.deepEqual(
      resolvePublicVideoDiscoveryHref({
        videoId: "extVideo001",
        catalogueEligible: false,
        youtubeWatchUrl: "https://www.youtube.com/watch?v=extVideo001",
      }),
      { href: "https://www.youtube.com/watch?v=extVideo001", external: true },
    );
  });

  it("never invents Mesa watch pages for invalid IDs", () => {
    assert.equal(publicMesaWatchPath("bad"), null);
    assert.equal(
      resolvePublicVideoDiscoveryHref({
        videoId: "not-valid",
        catalogueEligible: true,
      }),
      null,
    );
  });

  it("wires Series page to honour watchExternal", () => {
    const page = read("app/series/[slug]/page.tsx");
    const series = read("lib/series.ts");
    assert.match(page, /external=\{item\.watchExternal\}/);
    assert.match(series, /resolvePublicVideoDiscoveryHref/);
    assert.doesNotMatch(series, /loadPublicVideoCatalogue/);
  });
});

describe("phase 5C — hub / watch UI contracts", () => {
  it("hub SEO: canonical /videos and noindex on shorts filter", () => {
    const hub = read("app/videos/page.tsx");
    assert.match(hub, /canonical: "\/videos"/);
    assert.match(hub, /index: false/);
    assert.match(hub, /openGraph/);
  });

  it("hub remains poster-only (0 iframes)", () => {
    for (const rel of [
      "components/youtube/PublicFeaturedVideo.tsx",
      "components/youtube/PublicVideoCard.tsx",
      "components/youtube/PublicVideosCatalogue.tsx",
      "app/videos/page.tsx",
    ]) {
      const source = read(rel);
      assert.doesNotMatch(source, /iframe/i);
      assert.doesNotMatch(source, /YouTubeEmbedFacade/);
    }
  });

  it("shows Shorts section on default long view when Shorts exist", () => {
    const catalogue = read("components/youtube/PublicVideosCatalogue.tsx");
    assert.match(catalogue, /showLongSections && shorts\.length > 0/);
    assert.match(catalogue, /shorts-heading/);
  });

  it("watch uses facade-first player with LONG/SHORT layout markers", () => {
    const player = read("components/youtube/PublicWatchPlayer.tsx");
    const watch = read("app/videos/[videoId]/page.tsx");
    assert.match(player, /YouTubeEmbedFacade/);
    assert.match(player, /data-watch-layout/);
    assert.match(watch, /portrait=\{isShort\}/);
    assert.match(watch, /PublicWatchRecipeCta/);
    assert.match(watch, /More from Mesa/);
  });

  it("Recipe instructional surfaces do not navigate to public watch", () => {
    const watchMethod = read("components/youtube/RecipeWatchMethod.tsx");
    const hero = read("components/RecipePageHeroActions.tsx");
    assert.doesNotMatch(watchMethod, /\/videos\/\$\{/);
    assert.doesNotMatch(hero, /href=\{`\/videos\//);
  });
});

describe("phase 5C — analytics click-only conversion payloads", () => {
  it("builds Featured / card / watch payloads with distinct placements", () => {
    const featured = funnelPayloadFromAnalyticsDetail({
      event: "videos_recipe_click",
      video_id: "longLinked1",
      recipe_slug: "soft-stovetop-flatbread",
      placement: "featured",
      source: "LONG",
    });
    const card = funnelPayloadFromAnalyticsDetail({
      event: "videos_recipe_click",
      video_id: "shortLink03",
      recipe_slug: "garlic-oil",
      placement: "full_grid",
      source: "SHORT",
    });
    const watch = funnelPayloadFromAnalyticsDetail({
      event: "videos_recipe_click",
      video_id: "longLinked1",
      recipe_slug: "soft-stovetop-flatbread",
      placement: "watch_page",
      source: "LONG",
    });
    assert.equal(featured?.name, "video_to_recipe");
    assert.equal(featured?.placement, "videos_featured");
    assert.equal(card?.placement, "videos_card");
    assert.equal(watch?.placement, "videos_watch");
  });

  it("does not map Recipe→Video events to video_to_recipe", () => {
    assert.notEqual(mapClientEventToFunnelName("recipe_video_play"), "video_to_recipe");
    assert.notEqual(mapClientEventToFunnelName("recipe_video_timestamp_click"), "video_to_recipe");
  });

  it("wires FunnelAnalyticsBridge consent gate", () => {
    const bridge = read("components/FunnelAnalyticsBridge.tsx");
    assert.match(bridge, /analyticsAllowed/);
    assert.match(bridge, /recordFunnelEvent/);
    assert.match(bridge, /mesa:analytics/);
  });
});

describe("phase 5C — separation regressions (wiring)", () => {
  it("keeps Recently Viewed Recipe-only", () => {
    const recent = read("lib/recently-viewed.ts");
    assert.match(recent, /mesa:recently-viewed:v1/);
    assert.doesNotMatch(recent, /videoId|YouTubeVideo/);
  });

  it("keeps SearchOverlay Recipe-focused", () => {
    const overlay = read("components/SearchOverlay.tsx");
    assert.match(overlay, /\/recipes\//);
    assert.doesNotMatch(overlay, /youTubeVideo|loadPublicVideoCatalogue/);
  });

  it("keeps member collections RecipeSave-backed", () => {
    const schema = read("../prisma/schema.prisma");
    assert.match(schema, /model SavedRecipeCollectionItem/);
    assert.match(schema, /recipeSaveId/);
    assert.doesNotMatch(schema, /SavedVideoCollection/);
  });
});
