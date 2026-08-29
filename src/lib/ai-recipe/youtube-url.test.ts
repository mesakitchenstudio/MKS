import assert from "node:assert/strict";
import { test } from "node:test";
import { mapGeminiException } from "./errors";
import { normalizeYouTubeForGemini } from "./youtube-url";

test("normalizeYouTubeForGemini strips youtu.be tracking params", () => {
  const normalized = normalizeYouTubeForGemini("https://youtu.be/67Lasu4MggU?si=vkAo4M512_E0rI6S");
  assert.ok(normalized);
  assert.equal(normalized.videoId, "67Lasu4MggU");
  assert.equal(normalized.canonicalUrl, "https://www.youtube.com/watch?v=67Lasu4MggU");
});

test("normalizeYouTubeForGemini accepts watch and shorts URLs", () => {
  assert.equal(
    normalizeYouTubeForGemini("https://www.youtube.com/watch?v=abcdefghijk")?.canonicalUrl,
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  assert.equal(
    normalizeYouTubeForGemini("https://www.youtube.com/shorts/abcdefghijk")?.canonicalUrl,
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
});

test("mapGeminiException maps auth failures", () => {
  const mapped = mapGeminiException(new Error("API key not valid. Please pass a valid API key."), "video_probe");
  assert.equal(mapped.code, "GEMINI_AUTH_FAILED");
});

test("mapGeminiException maps schema stage failures distinctly", () => {
  const mapped = mapGeminiException(new Error("Invalid JSON schema in response_format"), "recipe_schema");
  assert.equal(mapped.code, "RECIPE_SCHEMA_GENERATION_FAILED");
});
