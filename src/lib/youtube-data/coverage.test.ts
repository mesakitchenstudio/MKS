import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeRecipeCoverage,
  computeVideoCoverage,
  parseChannelVideoCount,
} from "./coverage.ts";

describe("coverage", () => {
  it("uses synced public video count as operational denominator", () => {
    const stats = computeVideoCoverage({
      linkedPublicVideoCount: 6,
      syncedPublicVideoCount: 21,
      channelVideoCount: 21,
      linkScope: { publishedLinks: 3, draftLinks: 3 },
    });
    assert.equal(stats.percentage, 29);
    assert.equal(stats.syncedPublicVideoCount, 21);
    assert.equal(stats.inventoryMismatch, false);
  });

  it("flags inventory mismatch against channel.videoCount", () => {
    const stats = computeVideoCoverage({
      linkedPublicVideoCount: 6,
      syncedPublicVideoCount: 20,
      channelVideoCount: 21,
    });
    assert.equal(stats.inventoryMismatch, true);
  });

  it("uses published recipes only for recipe coverage", () => {
    const stats = computeRecipeCoverage({
      publishedWithVideoCount: 6,
      publishedRecipeCount: 17,
    });
    assert.equal(stats.percentage, 35);
  });

  it("handles zero denominators safely", () => {
    assert.equal(computeVideoCoverage({ linkedPublicVideoCount: 0, syncedPublicVideoCount: 0, channelVideoCount: null }).percentage, 0);
    assert.equal(computeRecipeCoverage({ publishedWithVideoCount: 0, publishedRecipeCount: 0 }).percentage, 0);
  });

  it("parses channel video count strings", () => {
    assert.equal(parseChannelVideoCount("21"), 21);
    assert.equal(parseChannelVideoCount("1,930"), 1930);
  });
});
