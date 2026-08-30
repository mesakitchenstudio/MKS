import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDurationSeconds, parseIso8601Duration } from "./duration.ts";
import {
  recipeMainVideoId,
  titlesDifferSignificantly,
} from "./matching.ts";
import { videoRowStatus } from "./health.ts";
import {
  computeViewsGained,
  formatViewsGainedDisplay,
  shouldCreateChannelSnapshot,
  shouldCreateVideoSnapshot,
} from "./snapshots.ts";

describe("youtube-data snapshots", () => {
  it("skips redundant video snapshots when counters match and recent", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    assert.equal(
      shouldCreateVideoSnapshot(
        {
          recordedAt: recent,
          viewCount: "100",
          likeCount: "10",
          commentCount: "2",
        },
        { viewCount: "100", likeCount: "10", commentCount: "2" },
      ),
      false,
    );
  });

  it("creates a video snapshot when counters change", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    assert.equal(
      shouldCreateVideoSnapshot(
        {
          recordedAt: recent,
          viewCount: "100",
          likeCount: "10",
          commentCount: "2",
        },
        { viewCount: "105", likeCount: "10", commentCount: "2" },
      ),
      true,
    );
  });

  it("creates a video snapshot after the dedup window even when counters match", () => {
    const older = new Date(Date.now() - 7 * 60 * 60 * 1000);
    assert.equal(
      shouldCreateVideoSnapshot(
        {
          recordedAt: older,
          viewCount: "100",
          likeCount: "10",
          commentCount: "2",
        },
        { viewCount: "100", likeCount: "10", commentCount: "2" },
      ),
      true,
    );
  });

  it("skips redundant channel snapshots on forced sync when counters match and recent", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    assert.equal(
      shouldCreateChannelSnapshot(
        {
          recordedAt: recent,
          viewCount: "1000",
          subscriberCount: "50",
          videoCount: "10",
        },
        { viewCount: "1000", subscriberCount: "50", videoCount: "10" },
        true,
      ),
      false,
    );
  });

  it("computes views gained against the previous snapshot", () => {
    assert.equal(computeViewsGained("150", undefined), null);
    assert.equal(computeViewsGained("150", "150"), "0");
    assert.equal(computeViewsGained("150", "100"), "+50");
    assert.equal(computeViewsGained("90", "100"), null);
    assert.equal(formatViewsGainedDisplay(null), "—");
    assert.equal(formatViewsGainedDisplay("0"), "0");
  });
});

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
