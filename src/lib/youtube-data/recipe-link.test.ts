import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyYoutubeMetadataSync,
  applyYoutubeVideoLinkToValues,
  clearYoutubeLinkFromValues,
  previewYoutubeMetadataSync,
  recipeLinkedVideoId,
  shouldApplyYoutubeThumbnailAsHero,
  markHeroImageManual,
} from "./recipe-link.ts";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";

const sampleVideo = {
  videoId: "67Laso4MggU",
  title: "Homemade Bread Without an Oven? You Need to Try This!",
  description: "0:00 Intro",
  thumbnailUrl: "https://i.ytimg.com/vi/67Laso4MggU/maxresdefault.jpg",
  durationDisplay: "5:38",
  durationSeconds: 338,
  publishedAt: null,
  privacyStatus: "public",
  embeddable: true,
  tags: ["bread"],
};

function verifiedMeta(overrides: Partial<RecipeAiMeta> = {}): RecipeAiMeta {
  return {
    generatedByAI: true,
    sourceType: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
    generatedAt: "2026-01-01T00:00:00.000Z",
    model: "test",
    schemaVersion: "1",
    verificationStatus: "verified",
    confidenceByPath: {},
    summary: { verified: 1, inferred: 0, estimated: 0, unknown: 0 },
    ...overrides,
  };
}

describe("recipe-link", () => {
  it("links by video id through youtubeUrl and youtube blob", () => {
    const linked = applyYoutubeVideoLinkToValues({}, sampleVideo);

    assert.equal(recipeLinkedVideoId(linked), "67Laso4MggU");
    assert.match(String(linked.youtubeUrl), /67Laso4MggU/);
    const blob = linked.youtube as { videoId?: string; title?: string };
    assert.equal(blob.videoId, "67Laso4MggU");
    assert.equal(blob.title, "Homemade Bread Without an Oven? You Need to Try This!");
  });

  it("populates empty Hero image from YouTube thumbnail on link", () => {
    const linked = applyYoutubeVideoLinkToValues({}, sampleVideo);
    assert.equal(linked.image, sampleVideo.thumbnailUrl);
  });

  it("clears link without removing Hero image", () => {
    const cleared = clearYoutubeLinkFromValues({
      intro: "Keep me",
      image: sampleVideo.thumbnailUrl,
      youtubeUrl: "https://www.youtube.com/watch?v=abc",
      youtube: { videoId: "abc", thumbnail: sampleVideo.thumbnailUrl },
    });
    assert.equal(cleared.intro, "Keep me");
    assert.equal(cleared.image, sampleVideo.thumbnailUrl);
    assert.equal(cleared.youtubeUrl, "");
    assert.equal(cleared.youtube, undefined);
  });

  it("replaces inherited YouTube Hero image when changing video", () => {
    const oldThumb = "https://i.ytimg.com/vi/OLDVIDEO1/hqdefault.jpg";
    const linked = applyYoutubeVideoLinkToValues(
      {
        image: oldThumb,
        youtube: { videoId: "OLDVIDEO1", thumbnail: oldThumb },
      },
      sampleVideo,
      {
        aiMeta: {
          generatedByAI: false,
          sourceType: "youtube",
          sourceUrl: "",
          generatedAt: "",
          model: "",
          schemaVersion: "",
          verificationStatus: "none",
          confidenceByPath: {},
          summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
          heroImageSource: "youtube_thumbnail",
          heroImageYoutubeVideoId: "OLDVIDEO1",
        },
      },
    );
    assert.equal(linked.image, sampleVideo.thumbnailUrl);
  });

  it("preserves manual Hero image when changing video", () => {
    const custom = "https://example.com/custom-hero.jpg";
    const linked = applyYoutubeVideoLinkToValues(
      {
        image: custom,
        youtube: { videoId: "OLDVIDEO1", thumbnail: "https://i.ytimg.com/vi/OLDVIDEO1/hqdefault.jpg" },
      },
      sampleVideo,
      {
        aiMeta: {
          generatedByAI: false,
          sourceType: "youtube",
          sourceUrl: "",
          generatedAt: "",
          model: "",
          schemaVersion: "",
          verificationStatus: "none",
          confidenceByPath: {},
          summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
          heroImageSource: "manual_url",
        },
      },
    );
    assert.equal(linked.image, custom);
  });

  it("shouldApplyYoutubeThumbnailAsHero is false for manual uploads", () => {
    const meta = markHeroImageManual(null, "https://xxx.public.blob.vercel-storage.com/hero.jpg");
    assert.equal(
      shouldApplyYoutubeThumbnailAsHero(
        { image: "https://xxx.public.blob.vercel-storage.com/hero.jpg" },
        meta,
        sampleVideo.thumbnailUrl,
      ),
      false,
    );
  });

  it("does not silently mutate verified recipes without allowVerifiedRecipeUpdates", () => {
    const values = {
      image: "https://example.com/custom.jpg",
      tags: ["keep"],
      youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
      youtube: {
        videoId: "67Laso4MggU",
        title: "Old title",
        duration: "1:00",
        thumbnail: "https://i.ytimg.com/vi/67Laso4MggU/hqdefault.jpg",
        timestamps: [{ time: 0, label: "Saved", stepIndex: 0 }],
      },
    };
    const next = applyYoutubeMetadataSync({
      values,
      aiMeta: verifiedMeta({ heroImageSource: "manual_url" }),
      video: sampleVideo,
    });
    assert.equal(next, values);
    assert.equal(next.image, "https://example.com/custom.jpg");
    assert.deepEqual(next.tags, ["keep"]);
  });

  it("with allowVerifiedRecipeUpdates refreshes link mirrors but not hero or chapters", () => {
    const values = {
      image: "https://example.com/custom.jpg",
      tags: ["keep"],
      intro: "Editorial intro",
      youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
      youtube: {
        videoId: "67Laso4MggU",
        title: "Old title",
        duration: "1:00",
        thumbnail: "https://i.ytimg.com/vi/67Laso4MggU/hqdefault.jpg",
        timestamps: [{ time: 0, label: "Saved", stepIndex: 0 }],
      },
    };
    const next = applyYoutubeMetadataSync({
      values,
      aiMeta: verifiedMeta({ heroImageSource: "manual_url" }),
      video: sampleVideo,
      allowVerifiedRecipeUpdates: true,
    });
    assert.equal(next.image, "https://example.com/custom.jpg");
    assert.equal(next.intro, "Editorial intro");
    assert.deepEqual(next.tags, ["keep"]);
    const blob = next.youtube as { duration?: string; thumbnail?: string; timestamps?: unknown[] };
    assert.equal(blob.duration, sampleVideo.durationDisplay);
    assert.equal(blob.thumbnail, sampleVideo.thumbnailUrl);
    assert.equal(blob.timestamps?.length, 1);
  });

  it("previews metadata sync without overwriting saved chapters", () => {
    const preview = previewYoutubeMetadataSync({
      values: {
        youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
        youtube: { timestamps: [{ time: 0, label: "Saved", stepIndex: 0 }] },
      },
      aiMeta: null,
      video: {
        ...sampleVideo,
        thumbnailUrl: "https://i.ytimg.com/vi/67Laso4MggU/hqdefault.jpg",
        description: "0:00 Intro\n1:00 Mix",
        tags: [],
      },
    });
    const chapters = preview.find((row) => row.key === "youtube.timestamps");
    assert.ok(chapters?.skipReason?.includes("saved chapters"));
  });

  it("does not invent a Hero image when thumbnail is missing", () => {
    const linked = applyYoutubeVideoLinkToValues({}, { ...sampleVideo, thumbnailUrl: "" });
    assert.equal(String(linked.image ?? ""), "");
  });
});
