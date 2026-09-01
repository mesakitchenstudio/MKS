import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterCatalogVideos,
  searchCatalogVideos,
  sortCatalogVideos,
  sortCatalogVideosByPerformance,
} from "./catalog-filters.ts";

const sample = [
  {
    videoId: "a",
    title: "Herb Focaccia",
    publishedAt: "Jan 1",
    publishedAtSort: 2,
    format: "LONG" as const,
    recipe: null,
    possibleMatch: null,
    relationship: "Unlinked",
    contentHealth: "—",
    hasMetadataIssue: false,
    periodViewsSort: 5000,
    subscribersGainedSort: 10,
    watchTimeSort: 200,
  },
  {
    videoId: "b",
    title: "Baguette Basics",
    publishedAt: "Feb 1",
    publishedAtSort: 3,
    format: "LONG" as const,
    recipe: { id: "r1", slug: "baguette", title: "Baguette" },
    possibleMatch: null,
    relationship: "Linked",
    contentHealth: "Chapters OK",
    hasMetadataIssue: false,
    periodViewsSort: 1000,
    subscribersGainedSort: 2,
    watchTimeSort: 50,
  },
  {
    videoId: "c",
    title: "Quick tip #shorts",
    publishedAt: "Mar 1",
    publishedAtSort: 4,
    format: "SHORT" as const,
    recipe: null,
    possibleMatch: null,
    relationship: "Unlinked",
    contentHealth: "—",
    hasMetadataIssue: false,
    periodViewsSort: 8000,
    subscribersGainedSort: 1,
    watchTimeSort: 10,
  },
];

describe("catalog filters", () => {
  it("searches by title", () => {
    assert.equal(searchCatalogVideos(sample, "focaccia").length, 1);
  });

  it("filters opportunities above median", () => {
    const filtered = filterCatalogVideos(sample, "opportunities", { catalogMedianPeriodViews: 2000 });
    assert.deepEqual(filtered.map((row) => row.videoId), ["a", "c"]);
  });

  it("sorts by period views descending", () => {
    const sorted = sortCatalogVideos(sample, "periodViews", "desc");
    assert.equal(sorted[0]?.videoId, "c");
  });

  it("default performance sort prefers subscribers then views", () => {
    const sorted = sortCatalogVideosByPerformance(sample);
    assert.equal(sorted[0]?.videoId, "a");
    assert.equal(sorted[1]?.videoId, "b");
    assert.equal(sorted[2]?.videoId, "c");
  });

  it("excludes shorts from missing-chapters filter unless flagged", () => {
    const withMissing = [
      ...sample,
      {
        ...sample[0],
        videoId: "d",
        title: "Long no chapters",
        contentHealth: "Missing chapters",
      },
    ];
    const filtered = filterCatalogVideos(withMissing, "missing-chapters");
    assert.deepEqual(filtered.map((row) => row.videoId), ["d"]);
  });
});
