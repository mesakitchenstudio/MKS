import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  funnelPayloadFromAnalyticsDetail,
  mapClientEventToFunnelName,
  mapSourceToPlacement,
  isFunnelEventName,
} from "@/lib/funnel-analytics";
import {
  buildFunnelSummary,
  computeContinuedViewing,
  formatFunnelRate,
  funnelDateWindow,
  uniqueVisitorsForEvents,
} from "@/lib/youtube-funnel/aggregate";
import { analyticsDateRange } from "@/lib/youtube-analytics/ranges";

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
  it("computes unique visitors and rates", () => {
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
    assert.equal(formatFunnelRate(summary.playRate), "20.0%");
    assert.equal(formatFunnelRate(null), "—");
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

  it("funnel date window includes today UTC (unlike YouTube Analytics lag)", () => {
    const now = new Date("2026-08-30T15:00:00.000Z");
    const funnel = funnelDateWindow(7, now);
    const yt = analyticsDateRange(7, now);
    assert.equal(funnel.endDate, "2026-08-30");
    assert.equal(funnel.startDate, "2026-08-24");
    assert.equal(yt.endDate, "2026-08-29");
    assert.ok(funnel.endExclusive.getTime() > now.getTime() || funnel.endExclusive.toISOString().startsWith("2026-08-31"));
    // An event created "now" must fall inside [start, endExclusive).
    assert.ok(now.getTime() >= funnel.start.getTime());
    assert.ok(now.getTime() < funnel.endExclusive.getTime());
  });
});
