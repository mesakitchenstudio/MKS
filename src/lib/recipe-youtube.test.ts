import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDescriptionChaptersToResolvedYoutube,
  hasRecipeYoutube,
  parseRecipeYoutubeBlob,
  resolveRecipeYoutube,
  timestampForStep,
  isSchemaVideoId,
} from "./recipe-youtube.ts";
import { DEV_YOUTUBE_FIXTURE, DEV_YOUTUBE_ALIAS_BLOB } from "../data/dev-youtube-fixture.ts";

describe("recipe-youtube", () => {
  it("returns null for recipes without video data", () => {
    assert.equal(resolveRecipeYoutube({ slug: "x", title: "X", youtubeUrl: undefined }), null);
    assert.equal(hasRecipeYoutube({ youtubeUrl: undefined }), false);
  });

  it("parses alias field names from fixture", () => {
    const parsed = parseRecipeYoutubeBlob(DEV_YOUTUBE_ALIAS_BLOB);
    assert.ok(parsed);
    assert.equal(parsed?.hook, "Section copy from alias.");
    assert.equal(parsed?.videoCtaDescription, "CTA copy from alias.");
    assert.equal(parsed?.timestamps?.[0]?.stepIndex, 0);
    assert.equal(parsed?.timestamps?.[0]?.time, 45);
    assert.equal(parsed?.relatedVideos?.[0]?.label, "Mexican");
  });

  it("reads thumbnail and videoId from editor preserved bag", () => {
    const parsed = parseRecipeYoutubeBlob({
      duration: "5:38",
      preserved: {
        videoId: "67Laso4MggU",
        thumbnail: "https://i.ytimg.com/vi/67Laso4MggU/maxresdefault.jpg",
        title: "Bread",
        url: "https://www.youtube.com/watch?v=67Laso4MggU",
      },
    });
    assert.equal(parsed?.videoId, "67Laso4MggU");
    assert.equal(parsed?.thumbnail, "https://i.ytimg.com/vi/67Laso4MggU/maxresdefault.jpg");
    assert.equal(parsed?.title, "Bread");
  });

  it("resolves main video from legacy youtubeUrl", () => {
    const resolved = resolveRecipeYoutube({
      slug: "test",
      title: "Test",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    assert.ok(resolved);
    assert.equal(resolved?.videoId, "dQw4w9WgXcQ");
  });

  it("maps timestamps to instruction steps", () => {
    const blob = parseRecipeYoutubeBlob(DEV_YOUTUBE_FIXTURE);
    const resolved = resolveRecipeYoutube({
      slug: "test",
      title: "Test",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      youtube: blob ?? undefined,
    });
    assert.equal(timestampForStep(resolved?.timestamps, 0)?.label, "See the roasting technique");
    assert.equal(timestampForStep(resolved?.timestamps, 2), undefined);
  });

  it("hides placeholder IDs from structured data", () => {
    assert.equal(isSchemaVideoId("PLACEHOLDER"), false);
    assert.equal(isSchemaVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  });

  it("omits related section data when array is empty", () => {
    const resolved = resolveRecipeYoutube({
      slug: "test",
      title: "Test",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      youtube: { relatedVideos: [] },
    });
    assert.deepEqual(resolved?.relatedVideos, []);
  });

  it("fallback watch hook uses dishName while preserving raw video title", () => {
    const resolved = resolveRecipeYoutube({
      slug: "crispy-rice",
      title: "Golden Crispy Rice with Eggs: You Won't Believe How Easy This Is!",
      dishName: "Golden Crispy Rice with Eggs",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      youtube: {
        title: "Golden Crispy Rice with Eggs: You Won't Believe How Easy This Is!",
      },
    });
    assert.equal(
      resolved?.title,
      "Golden Crispy Rice with Eggs: You Won't Believe How Easy This Is!",
    );
    assert.equal(
      resolved?.hook,
      "See exactly how we make Golden Crispy Rice with Eggs in the studio — the same step-by-step flow we use when testing this recipe.",
    );
    assert.doesNotMatch(resolved?.hook || "", /won't believe/i);
  });

  it("preserves an explicitly stored watch hook", () => {
    const resolved = resolveRecipeYoutube({
      slug: "crispy-rice",
      title: "Golden Crispy Rice with Eggs: You Won't Believe How Easy This Is!",
      dishName: "Golden Crispy Rice with Eggs",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      youtube: {
        title: "Golden Crispy Rice with Eggs: You Won't Believe How Easy This Is!",
        hook: "Manual studio hook stays intact.",
      },
    });
    assert.equal(resolved?.hook, "Manual studio hook stays intact.");
  });

  it("applyDescriptionChaptersToResolvedYoutube fills missing timestamps", () => {
    const base = resolveRecipeYoutube({
      slug: "soft-stovetop-flatbread",
      title: "Soft Stovetop Flatbread",
      youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
      youtube: { hook: "Studio walkthrough." },
    });
    assert.ok(base);
    assert.equal(base?.timestamps.length, 0);

    const description = `
0:00 The Secret to Perfect No-Oven Bread
0:42 Transforming Texture Through Kneading
2:17 Shaping and Preparing Your Portions
3:36 The Pan-Frying Technique
`.trim();

    const enriched = applyDescriptionChaptersToResolvedYoutube(base!, description, 337);
    assert.equal(enriched.timestamps.length, 4);
    assert.equal(enriched.timestamps[1].label, "Transforming Texture Through Kneading");
    assert.equal(enriched.duration, "05:37");
  });
});
