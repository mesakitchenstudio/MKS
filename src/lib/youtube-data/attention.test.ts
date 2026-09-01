import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAttentionQueue,
  catalogMedianPeriodViews,
  topAttentionItems,
} from "./attention.ts";
import { emptyAggregatedMetrics } from "@/lib/youtube-analytics/aggregate";

describe("attention queue", () => {
  it("ranks critical broken relationship before metadata drift", () => {
    const queue = buildAttentionQueue({
      videos: [
        {
          videoId: "v1",
          title: "Popular unlinked",
          privacyStatus: "public",
          embeddable: true,
          format: "LONG",
          publishedAt: new Date(),
          hasDescriptionChapters: false,
          hasRecipeChapters: false,
          hasMetadataIssue: false,
          analytics: { ...emptyAggregatedMetrics(), views: 5000, subscribersGained: 20 },
        },
      ],
      healthIssues: [
        {
          id: "video-not-embeddable-v2",
          label: "Recipe links to non-embeddable video",
          href: "/admin/recipes/r1",
          kind: "recipe",
        },
        {
          id: "title-diff-v1",
          label: "Title differs",
          href: "/admin/recipes/r2",
          kind: "recipe",
        },
      ],
      catalogMedianPeriodViews: 1000,
      analyticsConnected: true,
    });

    assert.equal(queue[0]?.priority, "P0");
    assert.match(queue[0]?.id || "", /video-not-embeddable/);
    const metadata = queue.find((item) => item.id.startsWith("title-diff"));
    const valuable = queue.find((item) => item.id.startsWith("valuable-unlinked"));
    assert.ok(metadata);
    assert.ok(valuable);
    assert.ok(queue.indexOf(queue[0]!) < queue.indexOf(metadata!));
    assert.ok(queue.indexOf(valuable!) < queue.indexOf(metadata!));
  });

  it("sorts valuable unlinked by subscribers then views", () => {
    const queue = buildAttentionQueue({
      videos: [
        {
          videoId: "low",
          title: "Low",
          privacyStatus: "public",
          embeddable: true,
          format: "LONG",
          publishedAt: new Date("2024-01-01"),
          hasDescriptionChapters: true,
          hasRecipeChapters: false,
          hasMetadataIssue: false,
          analytics: { ...emptyAggregatedMetrics(), views: 2000, subscribersGained: 5, estimatedMinutesWatched: 100 },
        },
        {
          videoId: "high",
          title: "High",
          privacyStatus: "public",
          embeddable: true,
          format: "LONG",
          publishedAt: new Date("2024-02-01"),
          hasDescriptionChapters: true,
          hasRecipeChapters: false,
          hasMetadataIssue: false,
          analytics: { ...emptyAggregatedMetrics(), views: 1500, subscribersGained: 12, estimatedMinutesWatched: 80 },
        },
      ],
      healthIssues: [],
      catalogMedianPeriodViews: 1000,
      analyticsConnected: true,
    });

    const valuable = queue.filter((item) => item.id.startsWith("valuable-unlinked"));
    assert.equal(valuable[0]?.videoId, "high");
  });

  it("returns at most three top items", () => {
    const queue = buildAttentionQueue({
      videos: Array.from({ length: 5 }, (_, index) => ({
        videoId: `v${index}`,
        title: `Video ${index}`,
        privacyStatus: "public",
        embeddable: true,
        format: "LONG" as const,
        publishedAt: new Date(),
        hasDescriptionChapters: true,
        hasRecipeChapters: false,
        hasMetadataIssue: false,
        analytics: { ...emptyAggregatedMetrics(), views: 5000 - index, subscribersGained: 10 - index },
      })),
      healthIssues: [],
      catalogMedianPeriodViews: 100,
      analyticsConnected: true,
    });
    assert.ok(topAttentionItems(queue, 3).length <= 3);
  });
});

describe("catalogMedianPeriodViews", () => {
  it("computes median of positive values", () => {
    assert.equal(catalogMedianPeriodViews([0, 10, 20, 30]), 20);
  });
});
