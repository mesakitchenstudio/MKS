import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWatchNextEligibleVideo,
  pickWatchNextFromCandidates,
  scoreWatchNextCandidate,
  type WatchNextCandidate,
} from "@/lib/youtube-data/watch-next-select";

function candidate(partial: Partial<WatchNextCandidate> & Pick<WatchNextCandidate, "videoId">): WatchNextCandidate {
  return {
    title: partial.title || "Video",
    thumbnailUrl: partial.thumbnailUrl || "",
    durationDisplay: partial.durationDisplay || "10:00",
    durationSeconds: partial.durationSeconds ?? 600,
    publishedAt: partial.publishedAt ?? new Date("2026-01-01"),
    privacyStatus: partial.privacyStatus ?? "public",
    embeddable: partial.embeddable ?? true,
    format: partial.format ?? "LONG",
    recipeSlug: partial.recipeSlug,
    recipeTitle: partial.recipeTitle,
    recipeCategories: partial.recipeCategories ?? [],
    curated: partial.curated ?? false,
    videoId: partial.videoId,
  };
}

describe("watch-next recommendation", () => {
  it("rejects private and non-embeddable videos", () => {
    assert.equal(isWatchNextEligibleVideo({ privacyStatus: "public", embeddable: true }), true);
    assert.equal(isWatchNextEligibleVideo({ privacyStatus: "private", embeddable: true }), false);
    assert.equal(isWatchNextEligibleVideo({ privacyStatus: "unlisted", embeddable: true }), false);
    assert.equal(isWatchNextEligibleVideo({ privacyStatus: "public", embeddable: false }), false);
  });

  it("never returns the current video", () => {
    const picked = pickWatchNextFromCandidates(
      [
        candidate({ videoId: "aaaaaaaaaaa", title: "Current" }),
        candidate({ videoId: "bbbbbbbbbbb", title: "Other", recipeSlug: "other" }),
      ],
      { currentVideoId: "aaaaaaaaaaa", currentCategories: [] },
    );
    assert.ok(picked);
    assert.equal(picked?.videoId, "bbbbbbbbbbb");
  });

  it("prefers same-category linked long-form over short", () => {
    const shared = candidate({
      videoId: "ccccccccccc",
      format: "LONG",
      recipeSlug: "salsa",
      recipeCategories: ["sauces"],
    });
    const short = candidate({
      videoId: "ddddddddddd",
      format: "SHORT",
      recipeSlug: "quick",
      recipeCategories: ["sauces"],
      curated: true,
    });
    assert.ok(scoreWatchNextCandidate(shared, ["sauces"]) > scoreWatchNextCandidate(short, ["sauces"]));
    const picked = pickWatchNextFromCandidates([short, shared], {
      currentVideoId: "zzzzzzzzzzz",
      currentCategories: ["sauces"],
    });
    assert.equal(picked?.videoId, "ccccccccccc");
    assert.equal(picked?.recipeSlug, "salsa");
  });

  it("hides section when no eligible candidates", () => {
    const picked = pickWatchNextFromCandidates(
      [candidate({ videoId: "aaaaaaaaaaa", privacyStatus: "private" })],
      { currentVideoId: "bbbbbbbbbbb", currentCategories: [] },
    );
    assert.equal(picked, null);
  });
});
