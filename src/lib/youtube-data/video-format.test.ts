import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyYouTubeVideoFormat,
  parseYoutubeDashboardFilter,
  titleHasSoftShortSignal,
  youtubeDashboardFilterQueryValue,
  youtubeVideoFormatLabel,
} from "./video-format.ts";

describe("classifyYouTubeVideoFormat", () => {
  it("classifies shorts URL as SHORT", () => {
    assert.equal(
      classifyYouTubeVideoFormat({
        title: "Quick tip",
        durationSeconds: 45,
        url: "https://www.youtube.com/shorts/abcdefghijk",
      }),
      "SHORT",
    );
  });

  it("classifies #shorts + short duration as SHORT", () => {
    assert.equal(
      classifyYouTubeVideoFormat({
        title: "Garlic butter #shorts",
        durationSeconds: 58,
        tags: ["cooking"],
      }),
      "SHORT",
    );
  });

  it("classifies shorts tag + short duration as SHORT", () => {
    assert.equal(
      classifyYouTubeVideoFormat({
        title: "Toast tip",
        durationSeconds: 40,
        tags: ["Shorts"],
      }),
      "SHORT",
    );
  });

  it("classifies videos longer than 3 minutes as LONG", () => {
    assert.equal(
      classifyYouTubeVideoFormat({
        title: "Full flatbread recipe",
        durationSeconds: 612,
      }),
      "LONG",
    );
  });

  it("keeps mid-length clips without Shorts evidence as UNKNOWN", () => {
    assert.equal(
      classifyYouTubeVideoFormat({
        title: "Quick skillet eggs",
        durationSeconds: 95,
        tags: ["breakfast"],
      }),
      "UNKNOWN",
    );
  });

  it("classifies classic ≤60s duration as SHORT without markers", () => {
    assert.equal(
      classifyYouTubeVideoFormat({
        title: "Stop buying ice cream and do this instead",
        durationSeconds: 59,
      }),
      "SHORT",
    );
  });

  it("classifies ≤90s duration fallback as SHORT for unmarked short-form", () => {
    assert.equal(
      classifyYouTubeVideoFormat({
        title: "You haven't tasted chocolate like this #chocolate",
        durationSeconds: 64,
      }),
      "SHORT",
    );
    assert.equal(
      classifyYouTubeVideoFormat({
        title: "Chocolate donut short 2026 19 08",
        durationSeconds: 68,
      }),
      "SHORT",
    );
  });

  it("uses soft title short signal within Shorts length", () => {
    assert.equal(titleHasSoftShortSignal("Chocolate donut short 2026"), true);
    assert.equal(titleHasSoftShortSignal("Classic shortbread cookies"), false);
    assert.equal(
      classifyYouTubeVideoFormat({
        title: "Studio short tip",
        durationSeconds: 120,
      }),
      "SHORT",
    );
  });

  it("respects stored explicit format", () => {
    assert.equal(
      classifyYouTubeVideoFormat({
        videoFormat: "SHORT",
        title: "Anything",
        durationSeconds: 900,
      }),
      "SHORT",
    );
    assert.equal(
      classifyYouTubeVideoFormat({
        videoFormat: "LONG",
        title: "Tip #shorts",
        durationSeconds: 40,
      }),
      "LONG",
    );
  });

  it("labels formats for UI", () => {
    assert.equal(youtubeVideoFormatLabel("SHORT"), "Short");
    assert.equal(youtubeVideoFormatLabel("LONG"), "Long");
    assert.equal(youtubeVideoFormatLabel("UNKNOWN"), "Unknown");
  });
});

describe("youtube dashboard filter query", () => {
  it("parses and serializes filter query values", () => {
    assert.equal(parseYoutubeDashboardFilter("shorts"), "shorts");
    assert.equal(parseYoutubeDashboardFilter("needs-recipe"), "needs");
    assert.equal(parseYoutubeDashboardFilter("linked"), "linked");
    assert.equal(parseYoutubeDashboardFilter("opportunities"), "opportunities");
    assert.equal(parseYoutubeDashboardFilter("missing-chapters"), "missing-chapters");
    assert.equal(parseYoutubeDashboardFilter("metadata"), "metadata");
    assert.equal(parseYoutubeDashboardFilter(""), "all");
    assert.equal(youtubeDashboardFilterQueryValue("shorts"), "shorts");
    assert.equal(youtubeDashboardFilterQueryValue("opportunities"), "opportunities");
    assert.equal(youtubeDashboardFilterQueryValue("needs"), "needs-recipe");
    assert.equal(youtubeDashboardFilterQueryValue("all"), null);
  });
});
