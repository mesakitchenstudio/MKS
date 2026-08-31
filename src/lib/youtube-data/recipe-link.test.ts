import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyYoutubeMetadataSync,
  applyYoutubeVideoLinkToValues,
  clearYoutubeLinkFromValues,
  fillEmptyHeroImageFromYoutubeThumbnail,
  previewYoutubeMetadataSync,
  recipeLinkedVideoId,
  resolveLinkedYoutubeThumbnailUrl,
  shouldApplyYoutubeThumbnailAsHero,
  markHeroImageManual,
} from "./recipe-link.ts";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { mergeAiDraftIntoEditor } from "@/lib/ai-recipe/normalize.ts";

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

const customHero = "https://example.com/custom-hero.jpg";

function baseMeta(overrides: Partial<RecipeAiMeta> = {}): RecipeAiMeta {
  return {
    generatedByAI: false,
    sourceType: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
    generatedAt: "2026-01-01T00:00:00.000Z",
    model: "test",
    schemaVersion: "1",
    verificationStatus: "none",
    confidenceByPath: {},
    summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
    ...overrides,
  };
}

function verifiedMeta(overrides: Partial<RecipeAiMeta> = {}): RecipeAiMeta {
  return baseMeta({
    generatedByAI: true,
    verificationStatus: "verified",
    summary: { verified: 1, inferred: 0, estimated: 0, unknown: 0 },
    ...overrides,
  });
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

  it("new YouTube recipe with empty hero gets thumbnail as hero", () => {
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
        aiMeta: baseMeta({
          heroImageSource: "youtube_thumbnail",
          heroImageYoutubeVideoId: "OLDVIDEO1",
        }),
      },
    );
    assert.equal(linked.image, sampleVideo.thumbnailUrl);
  });

  it("preserves manual Hero image when changing video", () => {
    const linked = applyYoutubeVideoLinkToValues(
      {
        image: customHero,
        youtube: { videoId: "OLDVIDEO1", thumbnail: "https://i.ytimg.com/vi/OLDVIDEO1/hqdefault.jpg" },
      },
      sampleVideo,
      {
        aiMeta: baseMeta({ heroImageSource: "manual_url" }),
      },
    );
    assert.equal(linked.image, customHero);
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

  it("resolves thumbnail from editor preserved.thumbnail", () => {
    const values = {
      image: "",
      youtube: {
        duration: "5:38",
        preserved: {
          videoId: sampleVideo.videoId,
          thumbnail: sampleVideo.thumbnailUrl,
          title: sampleVideo.title,
          url: `https://www.youtube.com/watch?v=${sampleVideo.videoId}`,
        },
      },
    };
    assert.equal(resolveLinkedYoutubeThumbnailUrl(values), sampleVideo.thumbnailUrl);
  });

  it("existing linked recipe + empty hero fills from preserved thumbnail (Regenerate path)", () => {
    const before = {
      image: "",
      intro: "AI intro",
      youtubeUrl: `https://www.youtube.com/watch?v=${sampleVideo.videoId}`,
      youtube: {
        duration: "5:38",
        preserved: {
          videoId: sampleVideo.videoId,
          thumbnail: sampleVideo.thumbnailUrl,
          title: sampleVideo.title,
        },
      },
    };
    const fields = [
      { key: "intro", label: "Intro", kind: "textarea" as const, required: false },
      { key: "image", label: "Hero image", kind: "image" as const, required: true },
      { key: "youtubeUrl", label: "YouTube URL", kind: "text" as const, required: false },
      { key: "youtube", label: "YouTube", kind: "textarea" as const, required: false },
    ];
    const merged = mergeAiDraftIntoEditor(
      {
        title: "Bread",
        slug: "bread",
        excerpt: "",
        featured: false,
        seasonal: false,
        categoryIds: [],
        values: before,
      },
      {
        title: "Bread",
        slug: "bread",
        excerpt: "Fresh",
        categoryIds: [],
        values: { intro: "Better intro", image: "" },
        confidenceByPath: {},
        summary: { verified: 0, inferred: 1, estimated: 0, unknown: 0 },
        insufficientRecipeInformation: false,
        insufficientReason: "",
      },
      fields,
      "fill_empty",
      baseMeta(),
    );
    assert.equal(String(merged.values.image ?? ""), "");
    const filled = fillEmptyHeroImageFromYoutubeThumbnail(merged.values, baseMeta());
    assert.equal(filled.applied, true);
    assert.equal(filled.values.image, sampleVideo.thumbnailUrl);
    assert.equal(filled.aiMeta?.heroImageSource, "youtube_thumbnail");
    // Publish gate: required hero is satisfied after auto-fill.
    assert.ok(String(filled.values.image ?? "").trim().length > 0);
  });

  it("existing custom hero + Regenerate leaves custom hero unchanged", () => {
    const before = {
      image: customHero,
      youtube: {
        preserved: {
          videoId: sampleVideo.videoId,
          thumbnail: sampleVideo.thumbnailUrl,
        },
      },
    };
    const fields = [
      { key: "image", label: "Hero image", kind: "image" as const, required: true },
      { key: "youtube", label: "YouTube", kind: "textarea" as const, required: false },
    ];
    const merged = mergeAiDraftIntoEditor(
      {
        title: "Bread",
        slug: "bread",
        excerpt: "",
        featured: false,
        seasonal: false,
        categoryIds: [],
        values: before,
      },
      {
        title: "Bread",
        slug: "bread",
        excerpt: "",
        categoryIds: [],
        values: { image: "" },
        confidenceByPath: {},
        summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
        insufficientRecipeInformation: false,
        insufficientReason: "",
      },
      fields,
      "replace_all_ai_fillable",
      baseMeta({ heroImageSource: "manual_url" }),
    );
    assert.equal(merged.values.image, customHero);
    const filled = fillEmptyHeroImageFromYoutubeThumbnail(
      merged.values,
      baseMeta({
        heroImageSource: "manual_url",
      }),
    );
    assert.equal(filled.applied, false);
    assert.equal(filled.values.image, customHero);
  });

  it("existing linked recipe + empty hero + metadata refresh fills thumbnail", () => {
    const values = {
      image: "",
      youtubeUrl: `https://www.youtube.com/watch?v=${sampleVideo.videoId}`,
      youtube: {
        videoId: sampleVideo.videoId,
        title: "Old title",
        duration: "1:00",
        thumbnail: "",
      },
    };
    const next = applyYoutubeMetadataSync({
      values,
      aiMeta: baseMeta(),
      video: sampleVideo,
    });
    assert.equal(next.image, sampleVideo.thumbnailUrl);
  });

  it("existing custom hero + metadata refresh leaves custom hero unchanged", () => {
    const values = {
      image: customHero,
      youtubeUrl: `https://www.youtube.com/watch?v=${sampleVideo.videoId}`,
      youtube: {
        videoId: sampleVideo.videoId,
        thumbnail: "https://i.ytimg.com/vi/67Laso4MggU/hqdefault.jpg",
      },
    };
    const next = applyYoutubeMetadataSync({
      values,
      aiMeta: baseMeta({ heroImageSource: "manual_url" }),
      video: sampleVideo,
    });
    assert.equal(next.image, customHero);
  });

  it("YouTube thumbnail changes + custom hero exists → custom hero unchanged", () => {
    const values = {
      image: customHero,
      youtubeUrl: `https://www.youtube.com/watch?v=${sampleVideo.videoId}`,
      youtube: {
        videoId: sampleVideo.videoId,
        thumbnail: "https://i.ytimg.com/vi/67Laso4MggU/hqdefault.jpg",
      },
    };
    const next = applyYoutubeMetadataSync({
      values,
      aiMeta: baseMeta({ heroImageSource: "manual_upload" }),
      video: {
        ...sampleVideo,
        thumbnailUrl: "https://i.ytimg.com/vi/67Laso4MggU/maxresdefault.jpg",
      },
    });
    assert.equal(next.image, customHero);
  });

  it("no YouTube thumbnail → hero remains empty", () => {
    const linked = applyYoutubeVideoLinkToValues({}, { ...sampleVideo, thumbnailUrl: "" });
    assert.equal(String(linked.image ?? ""), "");
    const filled = fillEmptyHeroImageFromYoutubeThumbnail(
      { image: "", youtube: { videoId: sampleVideo.videoId } },
      baseMeta(),
    );
    assert.equal(filled.applied, false);
    assert.equal(String(filled.values.image ?? ""), "");
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

  it("with allowVerifiedRecipeUpdates refreshes link mirrors and YouTube chapters but not custom hero or editorial", () => {
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
    const blob = next.youtube as {
      duration?: string;
      thumbnail?: string;
      timestamps?: { time: number; label: string }[];
    };
    assert.equal(blob.duration, sampleVideo.durationDisplay);
    assert.equal(blob.thumbnail, sampleVideo.thumbnailUrl);
    assert.equal(blob.timestamps?.length, 1);
    assert.equal(blob.timestamps?.[0]?.label, "Intro");
  });

  it("preserves human-edited chapters on metadata refresh", () => {
    const values = {
      youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
      youtube: {
        videoId: "67Laso4MggU",
        timestamps: [{ time: 0, label: "Manual chapter", stepIndex: 0 }],
      },
    };
    const next = applyYoutubeMetadataSync({
      values,
      aiMeta: baseMeta({
        fieldProvenance: {
          "values.youtube.timestamps": {
            aiGenerated: false,
            aiGeneratedValue: null,
            humanModifiedAfterGeneration: true,
          },
        },
      }),
      video: {
        ...sampleVideo,
        description: "0:00 Intro\n1:00 Mix the dough",
      },
    });
    const blob = next.youtube as { timestamps?: { label: string }[] };
    assert.equal(blob.timestamps?.[0]?.label, "Manual chapter");
  });

  it("verified + empty hero + confirmed refresh fills hero from thumbnail", () => {
    const values = {
      image: "",
      youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
      youtube: {
        videoId: "67Laso4MggU",
        title: "Old title",
        duration: "1:00",
        thumbnail: "https://i.ytimg.com/vi/67Laso4MggU/hqdefault.jpg",
      },
    };
    const next = applyYoutubeMetadataSync({
      values,
      aiMeta: verifiedMeta(),
      video: sampleVideo,
      allowVerifiedRecipeUpdates: true,
    });
    assert.equal(next.image, sampleVideo.thumbnailUrl);
  });

  it("imports description chapters when linking a video with empty timestamps", () => {
    const next = applyYoutubeVideoLinkToValues(
      {},
      {
        ...sampleVideo,
        description: "0:00 Intro\n0:42 Mixing\n1:35 Stretch and fold",
      },
    );
    const blob = next.youtube as { timestamps?: { time: number; label: string }[] };
    assert.equal(blob.timestamps?.length, 3);
    assert.equal(blob.timestamps?.[1]?.label, "Mixing");
    assert.equal(blob.timestamps?.[1]?.time, 42);
  });

  it("refreshes empty timestamps from YouTube description chapters", () => {
    const next = applyYoutubeMetadataSync({
      values: {
        ingredients: [{ name: "Dough", items: ["flour"] }],
        youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
        youtube: {
          videoId: "67Laso4MggU",
          duration: "5:38",
          timestamps: [],
        },
      },
      aiMeta: baseMeta(),
      video: {
        ...sampleVideo,
        description: "0:00 Intro\n1:00 Mix\n2:00 Bake",
      },
    });
    const blob = next.youtube as { timestamps?: { label: string }[] };
    assert.equal(blob.timestamps?.length, 3);
    assert.deepEqual(next.ingredients, [{ name: "Dough", items: ["flour"] }]);
  });

  it("updates previously synced chapters when YouTube description changes", () => {
    const next = applyYoutubeMetadataSync({
      values: {
        youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
        youtube: {
          videoId: "67Laso4MggU",
          timestamps: [{ time: 0, label: "Old intro" }],
        },
      },
      aiMeta: baseMeta(),
      video: {
        ...sampleVideo,
        description: "0:00 New intro\n1:30 New mix",
      },
    });
    const blob = next.youtube as { timestamps?: { label: string }[] };
    assert.equal(blob.timestamps?.length, 2);
    assert.equal(blob.timestamps?.[0]?.label, "New intro");
  });

  it("previews metadata sync chapter updates unless human-locked", () => {
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
    assert.equal(chapters?.skipReason, undefined);
    assert.ok(chapters?.next.includes("2 chapter"));
  });

  it("previews keeping human-edited chapters", () => {
    const preview = previewYoutubeMetadataSync({
      values: {
        youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
        youtube: { timestamps: [{ time: 0, label: "Saved", stepIndex: 0 }] },
      },
      aiMeta: baseMeta({
        fieldProvenance: {
          "values.youtube.timestamps": {
            aiGenerated: false,
            aiGeneratedValue: null,
            humanModifiedAfterGeneration: true,
          },
        },
      }),
      video: {
        ...sampleVideo,
        description: "0:00 Intro\n1:00 Mix",
        tags: [],
      },
    });
    const chapters = preview.find((row) => row.key === "youtube.timestamps");
    assert.ok(chapters?.skipReason?.includes("Human-edited"));
  });

  it("does not invent a Hero image when thumbnail is missing", () => {
    const linked = applyYoutubeVideoLinkToValues({}, { ...sampleVideo, thumbnailUrl: "" });
    assert.equal(String(linked.image ?? ""), "");
  });

  it("YouTube thumbnail auto-populates hero without clearing AI imageAlt", () => {
    const alt =
      "A serving plate loaded with warm, golden-brown banana oatmeal cookies studded with mini chocolate chips.";
    const values = {
      image: "",
      imageAlt: alt,
      youtubeUrl: `https://www.youtube.com/watch?v=${sampleVideo.videoId}`,
      youtube: {
        preserved: {
          videoId: sampleVideo.videoId,
          thumbnail: sampleVideo.thumbnailUrl,
        },
      },
    };
    const filled = fillEmptyHeroImageFromYoutubeThumbnail(values, baseMeta());
    assert.equal(filled.values.image, sampleVideo.thumbnailUrl);
    assert.equal(filled.values.imageAlt, alt);

    const refreshed = applyYoutubeMetadataSync({
      values: filled.values,
      aiMeta: baseMeta(),
      video: sampleVideo,
    });
    assert.equal(refreshed.imageAlt, alt);
    assert.equal(refreshed.image, sampleVideo.thumbnailUrl);
  });
});
