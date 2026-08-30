import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyYouTubeVideoFormat,
  parseYoutubeDashboardFilter,
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

  it("does not invent SHORT for short duration without evidence", () => {
    assert.equal(
      classifyYouTubeVideoFormat({
        title: "Quick skillet eggs",
        durationSeconds: 95,
        tags: ["breakfast"],
      }),
      "UNKNOWN",
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
    assert.equal(parseYoutubeDashboardFilter(""), "all");
    assert.equal(youtubeDashboardFilterQueryValue("shorts"), "shorts");
    assert.equal(youtubeDashboardFilterQueryValue("needs"), "needs-recipe");
    assert.equal(youtubeDashboardFilterQueryValue("all"), null);
  });
});
