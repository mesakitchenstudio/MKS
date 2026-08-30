import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDurationSeconds, parseIso8601Duration } from "./duration.ts";
import {
  recipeMainVideoId,
  titlesDifferSignificantly,
} from "./matching.ts";
import { videoRowStatus } from "./health.ts";

describe("youtube-data duration", () => {
  it("parses ISO 8601 durations", () => {
    assert.equal(parseIso8601Duration("PT5M38S"), 338);
    assert.equal(parseIso8601Duration("PT1H4M12S"), 3852);
  });

  it("formats Mesa display durations", () => {
    assert.equal(formatDurationSeconds(338), "5:38");
    assert.equal(formatDurationSeconds(3852), "1:04:12");
  });
});

describe("youtube-data matching", () => {
  it("resolves recipe main video id from url", () => {
    assert.equal(
      recipeMainVideoId({
        youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
      }),
      "67Laso4MggU",
    );
  });

  it("detects significantly different titles", () => {
    assert.equal(
      titlesDifferSignificantly("Soft Stovetop Flatbread", "Chocolate Chip Cookies"),
      true,
    );
    assert.equal(
      titlesDifferSignificantly("Soft Stovetop Flatbread", "Soft Stovetop Flatbread Recipe"),
      false,
    );
  });
});

describe("youtube-data health status", () => {
  it("marks unlinked public videos as No recipe", () => {
    assert.equal(
      videoRowStatus({
        privacyStatus: "public",
        embeddable: true,
        hasDescriptionChapters: true,
        hasRecipeChapters: false,
      }),
      "No recipe",
    );
  });

  it("marks missing chapters when linked but empty", () => {
    assert.equal(
      videoRowStatus({
        privacyStatus: "public",
        embeddable: true,
        linkedRecipeId: "r1",
        hasDescriptionChapters: false,
        hasRecipeChapters: false,
      }),
      "Missing chapters",
    );
  });
});
