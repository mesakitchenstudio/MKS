import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  funnelPayloadFromAnalyticsDetail,
  mapClientEventToFunnelName,
  mapSourceToPlacement,
  isFunnelEventName,
} from "@/lib/funnel-analytics";
import {
  buildFunnelRecipeRows,
  buildFunnelSummary,
  computeContinuedViewing,
  continuedViewingVisitorIds,
  formatFunnelRate,
  funnelDateWindow,
  uniqueVisitorsForEvents,
} from "@/lib/youtube-funnel/aggregate";
import {
  compactLowSampleNotice,
  formatContinuedViewingOutcome,
  formatRecipeMultiVideoVisitorsLabel,
  formatRecipeVisitorOutcome,
  FUNNEL_LOW_SAMPLE_THRESHOLD,
  FUNNEL_METHODOLOGY,
  isFunnelLowSample,
  quietZeroVisitorOutcomeLabel,
  RECIPE_MULTI_VIDEO_VISITORS_HELP,
  RECIPE_MULTI_VIDEO_VISITORS_LABEL,
} from "@/lib/youtube-funnel/funnel-display";
import { isYoutubeFunnelAudienceHuman } from "@/lib/youtube-funnel/audience";
import { shouldSkipGuestAnalyticsIngest } from "@/lib/guest-tracking";
import { analyticsDateRange } from "@/lib/youtube-analytics/ranges";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

describe("funnel-analytics", () => {
  it("maps client events to canonical funnel names", () => {
    assert.equal(mapClientEventToFunnelName("recipe_video_play"), "recipe_video_play");
    assert.equal(mapClientEventToFunnelName("recipe_floating_video_play"), "recipe_video_play");
    assert.equal(
      mapClientEventToFunnelName("recipe_video_timestamp_click"),
      "recipe_video_chapter_click",
    );
    assert.equal(
      mapClientEventToFunnelName("recipe_video_watch_youtube_click"),
      "recipe_watch_on_youtube_click",
    );
    assert.equal(mapClientEventToFunnelName("recipe_video_cta_click"), null);
    assert.equal(mapClientEventToFunnelName("recipe_video_complete"), "recipe_video_ended");
    assert.equal(mapClientEventToFunnelName("recipe_related_video_click"), "recipe_watch_next_click");
    assert.equal(
      mapClientEventToFunnelName("series_watch_playlist_on_youtube_click"),
      "series_watch_playlist_on_youtube_click",
    );
    assert.ok(isFunnelEventName("recipe_youtube_subscribe_click"));
    assert.ok(isFunnelEventName("series_watch_playlist_on_youtube_click"));
  });

  it("maps video analytics sources to placements", () => {
    assert.equal(mapSourceToPlacement("hero_cta"), "hero");
    assert.equal(mapSourceToPlacement("main_embed"), "video_section");
    assert.equal(mapSourceToPlacement("floating_player"), "floating_player");
    assert.equal(mapSourceToPlacement("main_embed_chapter"), "chapter_section");
    assert.equal(mapSourceToPlacement("watch_next"), "watch_next");
    assert.equal(mapSourceToPlacement("watch_next_section"), "watch_next_section");
    assert.equal(mapSourceToPlacement("related_videos"), "watch_next");
    assert.equal(mapSourceToPlacement("subscribe"), "end_of_recipe");
    assert.equal(mapSourceToPlacement("end_of_recipe"), "end_of_recipe");
    assert.equal(mapSourceToPlacement("post_video_subscribe"), "post_video_subscribe");
    assert.equal(mapSourceToPlacement("post_recipe_subscribe"), "post_recipe_subscribe");
    assert.equal(mapSourceToPlacement("watch_method_subscribe"), "watch_method_subscribe");
    assert.equal(mapSourceToPlacement("recipe_end_subscribe"), "recipe_end_subscribe");
    assert.equal(mapSourceToPlacement("series_page"), "series_page");
    assert.equal(mapSourceToPlacement("unknown"), "other");
  });

  it("builds funnel payloads from analytics details", () => {
    const payload = funnelPayloadFromAnalyticsDetail({
      event: "recipe_video_timestamp_click",
      recipe_slug: "focaccia",
      video_id: "abc12345678",
      source: "main_embed_chapter",
      timestamp: 90,
      chapter_label: "Proof",
      chapter_index: 2,
    });
    assert.ok(payload);
    assert.equal(payload?.name, "recipe_video_chapter_click");
    assert.equal(payload?.placement, "chapter_section");
    assert.equal(payload?.chapterTimeSeconds, 90);
    assert.equal(payload?.chapterLabel, "Proof");
    assert.equal(payload?.chapterIndex, 2);
  });
});

describe("youtube-funnel aggregate", () => {
  it("computes unique visitors and parallel outcome rates", () => {
    const events = [
      { visitorId: "v1", name: "recipe_video_play", recipeSlug: "a", youtubeVideoId: "vid1", targetVideoId: "" },
      { visitorId: "v1", name: "recipe_video_play", recipeSlug: "a", youtubeVideoId: "vid1", targetVideoId: "" },
      { visitorId: "v2", name: "recipe_video_play", recipeSlug: "a", youtubeVideoId: "vid1", targetVideoId: "" },
      {
        visitorId: "v1",
        name: "recipe_watch_on_youtube_click",
        recipeSlug: "a",
        youtubeVideoId: "vid1",
        targetVideoId: "",
      },
    ];
    assert.equal(uniqueVisitorsForEvents(events, "recipe_video_play"), 2);
    const summary = buildFunnelSummary({
      uniquePageviewVisitors: 10,
      linkedRecipePageviews: 12,
      events,
    });
    assert.equal(summary.uniquePlayVisitors, 2);
    assert.equal(summary.playRate, 0.2);
    assert.equal(summary.uniqueWatchOnYoutubeVisitors, 1);
    assert.equal(summary.watchOnYoutubeCtr, 0.1);
    assert.equal(formatFunnelRate(summary.playRate, 10), "20%");
    assert.equal(formatFunnelRate(null), "—");
  });

  it("derives unique chapter-clicking visitors without schema changes", () => {
    const events = [
      { visitorId: "v1", name: "recipe_video_chapter_click", recipeSlug: "a" },
      { visitorId: "v1", name: "recipe_video_chapter_click", recipeSlug: "a" },
      { visitorId: "v2", name: "recipe_video_chapter_click", recipeSlug: "a" },
    ];
    const summary = buildFunnelSummary({
      uniquePageviewVisitors: 5,
      linkedRecipePageviews: 8,
      events: events.map((e) => ({
        ...e,
        youtubeVideoId: "vid",
        targetVideoId: "",
      })),
    });
    assert.equal(summary.chapterClicks, 3);
    assert.equal(summary.uniqueChapterVisitors, 2);
  });

  it("detects continued viewing across two distinct videos", () => {
    const single = computeContinuedViewing([
      {
        visitorId: "v1",
        name: "recipe_video_play",
        youtubeVideoId: "aaa",
        targetVideoId: "",
      },
      {
        visitorId: "v1",
        name: "recipe_video_play",
        youtubeVideoId: "aaa",
        targetVideoId: "",
      },
    ]);
    assert.equal(single.interacted, 1);
    assert.equal(single.continued, 0);

    const multi = computeContinuedViewing([
      {
        visitorId: "v1",
        name: "recipe_video_play",
        youtubeVideoId: "aaa",
        targetVideoId: "",
      },
      {
        visitorId: "v1",
        name: "recipe_watch_next_click",
        youtubeVideoId: "aaa",
        targetVideoId: "bbb",
      },
    ]);
    assert.equal(multi.interacted, 1);
    assert.equal(multi.continued, 1);
    assert.equal(multi.rate, 1);
  });

  it("continuedViewingSessions counts unique visitors not browser sessions", () => {
    const events = [
      { visitorId: "a", name: "recipe_video_play", youtubeVideoId: "v1", targetVideoId: "" },
      { visitorId: "a", name: "recipe_video_play", youtubeVideoId: "v2", targetVideoId: "" },
      { visitorId: "b", name: "recipe_video_play", youtubeVideoId: "v1", targetVideoId: "" },
    ];
    const summary = buildFunnelSummary({
      uniquePageviewVisitors: 10,
      linkedRecipePageviews: 10,
      events: events.map((e) => ({ ...e, recipeSlug: "x" })),
    });
    assert.equal(summary.continuedViewingSessions, 1);
    assert.equal(summary.videoInteractionSessions, 2);
    assert.equal(summary.continuedViewingRate, 0.5);
    assert.equal(continuedViewingVisitorIds(events).size, 1);
  });

  it("aggregates recipe rows with multi-video visitors intersecting pageview visitors", () => {
    const events = [
      { visitorId: "v1", name: "recipe_video_play", recipeSlug: "a", youtubeVideoId: "vid1", targetVideoId: "" },
      { visitorId: "v2", name: "recipe_video_play", recipeSlug: "b", youtubeVideoId: "vid2", targetVideoId: "" },
      { visitorId: "v1", name: "recipe_watch_on_youtube_click", recipeSlug: "a", youtubeVideoId: "vid1", targetVideoId: "" },
      { visitorId: "v1", name: "recipe_video_play", recipeSlug: "b", youtubeVideoId: "vid3", targetVideoId: "" },
      { visitorId: "v1", name: "recipe_watch_next_click", recipeSlug: "b", youtubeVideoId: "vid3", targetVideoId: "vid4" },
    ];
    const pageviewVisitorKeys = new Set(["a::v1", "b::v1", "b::v2"]);
    const rows = buildFunnelRecipeRows({
      recipes: [
        { recipeId: "1", recipeSlug: "a", recipeTitle: "Alpha", youtubeVideoId: "vid1" },
        { recipeId: "2", recipeSlug: "b", recipeTitle: "Beta", youtubeVideoId: "vid2" },
      ],
      pageviewsBySlug: new Map([
        ["a", { views: 3, uniqueVisitors: 1 }],
        ["b", { views: 5, uniqueVisitors: 2 }],
      ]),
      pageviewVisitorKeys,
      events,
    });
    assert.equal(rows[0]?.recipeSlug, "b");
    assert.equal(rows[0]?.uniquePageviewVisitors, 2);
    assert.equal(rows[0]?.uniqueContinuedVisitors, 1);
    assert.equal(formatRecipeMultiVideoVisitorsLabel(1, 2), "1 of 2 visitors");
    assert.equal(rows[1]?.uniquePlayVisitors, 1);
  });

  it("funnel date window includes today UTC (unlike YouTube Analytics lag)", () => {
    const now = new Date("2026-08-30T15:00:00.000Z");
    const funnel = funnelDateWindow(7, now);
    const yt = analyticsDateRange(7, now);
    assert.equal(funnel.endDate, "2026-08-30");
    assert.equal(funnel.startDate, "2026-08-24");
    assert.equal(yt.endDate, "2026-08-29");
    assert.ok(now.getTime() >= funnel.start.getTime());
    assert.ok(now.getTime() < funnel.endExclusive.getTime());
  });
});

describe("youtube-funnel display", () => {
  it("formats visitor-first outcomes with integer rates at low N", () => {
    const outcome = formatRecipeVisitorOutcome(4, 5);
    assert.equal(outcome.fractionLabel, "4 of 5 visitors");
    assert.equal(outcome.rateLabel, "80%");
    assert.equal(outcome.limitedSample, true);
    assert.equal(formatFunnelRate(0.8, 5), "80%");
    assert.equal(formatFunnelRate(0.812, 25), "81.2%");
  });

  it("uses video-interacting visitors as continued-viewing denominator", () => {
    const outcome = formatContinuedViewingOutcome(2, 4);
    assert.equal(outcome.headline, "2 continued-viewing visitors");
    assert.equal(outcome.fractionLabel, "2 of 4 video-interacting visitors");
    assert.equal(outcome.rateLabel, "50%");
    assert.equal(outcome.limitedSample, true);
  });

  it("does not show misleading continued rate against pageview visitors", () => {
    const pageviewDenom = 5;
    const continued = 2;
    const interacted = 4;
    assert.notEqual(continued / pageviewDenom, continued / interacted);
    const outcome = formatContinuedViewingOutcome(continued, interacted);
    assert.match(outcome.fractionLabel, /video-interacting visitors/);
  });

  it("flags low sample below threshold", () => {
    assert.equal(isFunnelLowSample(19), true);
    assert.equal(isFunnelLowSample(FUNNEL_LOW_SAMPLE_THRESHOLD), false);
    assert.equal(isFunnelLowSample(0), false);
  });

  it("uses Website video intro and compact low-sample copy", () => {
    assert.equal(
      FUNNEL_METHODOLOGY.intro,
      "First-party actions on recipe pages with a video. Not YouTube views or subscriptions.",
    );
    assert.equal(
      compactLowSampleNotice(5),
      "Limited sample · 5 unique visitors — rates can swing on one person.",
    );
    assert.equal(
      compactLowSampleNotice(1),
      "Limited sample · 1 unique visitor — rates can swing on one person.",
    );
  });

  it("quiets only zero-of-zero visitor outcome labels", () => {
    assert.equal(quietZeroVisitorOutcomeLabel("0 of 0 visitors"), "—");
    assert.equal(quietZeroVisitorOutcomeLabel("0 of 4 visitors"), "0 of 4 visitors");
    assert.equal(quietZeroVisitorOutcomeLabel("2 of 12 visitors"), "2 of 12 visitors");
  });

  it("names recipe-level multi-video metric without implying sequence from that recipe", () => {
    assert.equal(RECIPE_MULTI_VIDEO_VISITORS_LABEL, "Multi-video visitors");
    assert.match(RECIPE_MULTI_VIDEO_VISITORS_HELP, /does not necessarily mean the additional interaction occurred directly after this recipe/i);
    assert.equal(formatRecipeMultiVideoVisitorsLabel(2, 12), "2 of 12 visitors");
    assert.doesNotMatch(formatRecipeMultiVideoVisitorsLabel(2, 12), /%/);
  });
});

describe("youtube-funnel Phase 2D audience population", () => {
  it("1. Human visitor FunnelEvent → counted", () => {
    assert.equal(
      isYoutubeFunnelAudienceHuman({ clientKind: "human", userAgent: CHROME_WINDOWS }),
      true,
    );
  });

  it("2–4. Likely automated, Bot, and Unknown → excluded", () => {
    assert.equal(
      isYoutubeFunnelAudienceHuman({
        clientKind: "likely_automated",
        userAgent: CHROME_WINDOWS,
      }),
      false,
    );
    assert.equal(
      isYoutubeFunnelAudienceHuman({ clientKind: "bot", userAgent: GOOGLEBOT }),
      false,
    );
    assert.equal(
      isYoutubeFunnelAudienceHuman({ clientKind: "unknown", userAgent: "" }),
      false,
    );
  });

  it("5. Historical null clientKind + normal browser UA → Human", () => {
    assert.equal(
      isYoutubeFunnelAudienceHuman({ clientKind: null, userAgent: CHROME_WINDOWS }),
      true,
    );
  });

  it("6. Historical known bot UA → excluded", () => {
    assert.equal(
      isYoutubeFunnelAudienceHuman({ clientKind: null, userAgent: GOOGLEBOT }),
      false,
    );
  });

  it("7–8. Staff and public Members remain excluded at ingest", () => {
    assert.equal(
      shouldSkipGuestAnalyticsIngest({
        email: null,
        staffRole: "owner",
        hasVerifiedAdminSession: false,
      }),
      true,
    );
    assert.equal(
      shouldSkipGuestAnalyticsIngest({
        email: "member@example.com",
        staffRole: null,
        hasVerifiedAdminSession: false,
      }),
      true,
    );
  });

  it("9. Funnel summary calculations unchanged when only Human events are supplied", () => {
    const events = [
      {
        visitorId: "v1",
        name: "recipe_video_play",
        recipeSlug: "a",
        youtubeVideoId: "vid1",
        targetVideoId: "",
      },
      {
        visitorId: "v2",
        name: "recipe_watch_on_youtube_click",
        recipeSlug: "a",
        youtubeVideoId: "vid1",
        targetVideoId: "",
      },
    ];
    const summary = buildFunnelSummary({
      uniquePageviewVisitors: 10,
      linkedRecipePageviews: 12,
      events,
    });
    assert.equal(summary.uniquePlayVisitors, 1);
    assert.equal(summary.uniqueWatchOnYoutubeVisitors, 1);
    assert.equal(summary.playRate, 0.1);
    assert.equal(summary.watchOnYoutubeCtr, 0.1);
    assert.equal(summary.linkedRecipePageviews, 12);
  });

  it("prefers page-view UA when visitor UA is empty (same as Visitors traffic UA)", () => {
    assert.equal(
      isYoutubeFunnelAudienceHuman({
        clientKind: null,
        userAgent: "",
        pageViewUserAgent: CHROME_WINDOWS,
      }),
      true,
    );
    assert.equal(
      isYoutubeFunnelAudienceHuman({
        clientKind: null,
        userAgent: "",
        pageViewUserAgent: GOOGLEBOT,
      }),
      false,
    );
  });
});
