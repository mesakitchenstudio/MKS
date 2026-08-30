import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyYoutubeVideoLinkToValues,
  clearYoutubeLinkFromValues,
  previewYoutubeMetadataSync,
  recipeLinkedVideoId,
} from "./recipe-link.ts";

describe("recipe-link", () => {
  it("links by video id through youtubeUrl and youtube blob", () => {
    const linked = applyYoutubeVideoLinkToValues({}, {
      videoId: "67Laso4MggU",
      title: "Homemade Bread Without an Oven? You Need to Try This!",
      description: "0:00 Intro",
      thumbnailUrl: "https://i.ytimg.com/vi/67Laso4MggU/hqdefault.jpg",
      durationDisplay: "5:38",
      durationSeconds: 338,
      publishedAt: null,
      privacyStatus: "public",
      embeddable: true,
      tags: ["bread"],
    });

    assert.equal(recipeLinkedVideoId(linked), "67Laso4MggU");
    assert.match(String(linked.youtubeUrl), /67Laso4MggU/);
    const blob = linked.youtube as { videoId?: string; title?: string };
    assert.equal(blob.videoId, "67Laso4MggU");
    assert.equal(blob.title, "Homemade Bread Without an Oven? You Need to Try This!");
  });

  it("clears link without touching unrelated values", () => {
    const cleared = clearYoutubeLinkFromValues({
      intro: "Keep me",
      youtubeUrl: "https://www.youtube.com/watch?v=abc",
      youtube: { videoId: "abc" },
    });
    assert.equal(cleared.intro, "Keep me");
    assert.equal(cleared.youtubeUrl, "");
    assert.equal(cleared.youtube, undefined);
  });

  it("previews metadata sync without overwriting saved chapters", () => {
    const preview = previewYoutubeMetadataSync({
      values: {
        youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
        youtube: { timestamps: [{ time: 0, label: "Saved", stepIndex: 0 }] },
      },
      aiMeta: null,
      video: {
        videoId: "67Laso4MggU",
        title: "Video title",
        description: "0:00 Intro\n1:00 Mix",
        thumbnailUrl: "https://i.ytimg.com/vi/67Laso4MggU/hqdefault.jpg",
        durationDisplay: "5:38",
        durationSeconds: 338,
        publishedAt: null,
        privacyStatus: "public",
        embeddable: true,
        tags: [],
      },
    });
    const chapters = preview.find((row) => row.key === "youtube.timestamps");
    assert.ok(chapters?.skipReason?.includes("saved chapters"));
  });
});
