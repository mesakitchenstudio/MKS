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
  uniqueVisitorsForEvents,
} from "@/lib/youtube-funnel/aggregate";

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
    assert.ok(isFunnelEventName("recipe_youtube_subscribe_click"));
  });

  it("maps video analytics sources to placements", () => {
    assert.equal(mapSourceToPlacement("hero_cta"), "hero");
    assert.equal(mapSourceToPlacement("main_embed"), "video_section");
    assert.equal(mapSourceToPlacement("floating_player"), "floating_player");
    assert.equal(mapSourceToPlacement("main_embed_chapter"), "chapter_section");
    assert.equal(mapSourceToPlacement("watch_next"), "watch_next");
    assert.equal(mapSourceToPlacement("subscribe"), "subscribe");
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
});
