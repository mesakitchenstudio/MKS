import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AttentionQueueItem } from "./attention.ts";
import { buildAttentionReviewGroups, classifyAttentionReviewGroup } from "./attention-review.ts";
import {
  computeVideoLinkScopeBreakdown,
  formatVideoLinkScopeBreakdown,
} from "./coverage.ts";

function item(partial: Partial<AttentionQueueItem> & Pick<AttentionQueueItem, "id">): AttentionQueueItem {
  return {
    priority: "P2",
    rank: 0,
    title: partial.title || "Issue",
    detail: partial.detail || partial.id,
    actionLabel: partial.actionLabel || "Review",
    actionKind: partial.actionKind || "open-recipe",
    ...partial,
  };
}

describe("attention review grouping", () => {
  it("classifies relationship and metadata groups", () => {
    assert.equal(classifyAttentionReviewGroup(item({ id: "possible-match-v1", actionKind: "link-recipe" })), "relationship");
    assert.equal(classifyAttentionReviewGroup(item({ id: "title-diff-v1" })), "metadata");
    assert.equal(classifyAttentionReviewGroup(item({ id: "long-missing-chapters-v1" })), "chapters");
  });

  it("consolidates multiple metadata issues for the same recipe", () => {
    const groups = buildAttentionReviewGroups({
      items: [
        item({
          id: "title-diff-v1",
          detail: 'Title differs: video "Flatbread" vs recipe "Soft Stovetop Flatbread"',
          href: "/admin/recipes/r1",
        }),
        item({
          id: "verified-yt-drift-v1",
          detail: 'YouTube metadata has changed since verified recipe "Soft Stovetop Flatbread" was last reviewed',
          href: "/admin/recipes/r1",
        }),
      ],
      recipesWithoutVideo: [],
      remainingUnlinkedVideos: [],
    });

    const metadata = groups.find((group) => group.id === "metadata");
    assert.equal(metadata?.entities.length, 1);
    assert.equal(metadata?.entities[0]?.issues.length, 2);
    assert.equal(metadata?.entities[0]?.actionLabel, "Review recipe");
  });

  it("summarizes recipes without video with examples and more count", () => {
    const groups = buildAttentionReviewGroups({
      items: [],
      recipesWithoutVideo: Array.from({ length: 11 }, (_, index) => ({
        id: `r${index}`,
        title: `Recipe ${index + 1}`,
      })),
      remainingUnlinkedVideos: [],
    });

    const section = groups.find((group) => group.id === "recipes-without-video");
    assert.equal(section?.collapsed?.count, 11);
    assert.equal(section?.collapsed?.examples.length, 3);
    assert.equal(section?.collapsed?.moreCount, 8);
    assert.match(section?.collapsed?.summaryLine || "", /11 published recipes have no YouTube video/);
  });

  it("summarizes remaining unlinked videos with top views example", () => {
    const groups = buildAttentionReviewGroups({
      items: [item({ id: "remaining-unlinked-queue", actionKind: "review-queue", filterTarget: "needs-recipe" })],
      recipesWithoutVideo: [],
      remainingUnlinkedVideos: [
        { videoId: "a", title: "Viral potato sausage roll", periodViews: 18597 },
        { videoId: "b", title: "Other", periodViews: 100 },
      ],
    });

    const section = groups.find((group) => group.id === "videos-without-recipe");
    assert.equal(section?.collapsed?.count, 2);
    assert.equal(section?.collapsed?.topByViews?.title, "Viral potato sausage roll");
    assert.equal(section?.collapsed?.topByViews?.viewsLabel, "18,597");
  });
});

describe("coverage link scope breakdown", () => {
  it("computes published and draft link counts", () => {
    const breakdown = computeVideoLinkScopeBreakdown({
      linkedPublicVideoIds: ["v1", "v2", "v3"],
      linkRecipeIdByVideoId: new Map([
        ["v1", "r1"],
        ["v2", "r2"],
        ["v3", "r3"],
      ]),
      recipeStatusById: new Map([
        ["r1", "published"],
        ["r2", "published"],
        ["r3", "draft"],
      ]),
    });
    assert.deepEqual(breakdown, { publishedLinks: 2, draftLinks: 1 });
    assert.equal(formatVideoLinkScopeBreakdown(breakdown), "3 links total · 2 published · 1 draft");
  });
});
