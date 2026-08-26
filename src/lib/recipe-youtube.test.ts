import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
});
