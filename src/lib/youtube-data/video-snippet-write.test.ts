import assert from "node:assert/strict";
import { test, mock } from "node:test";
import {
  buildWritableVideoSnippet,
  parseYoutubeSnippetReadModel,
} from "@/lib/youtube-data/video-snippet-write";

test("buildWritableVideoSnippet preserves required and optional writable fields", () => {
  const current = {
    title: "A",
    categoryId: "26",
    description: "Old",
    tags: ["x", "y"],
    defaultLanguage: "en",
  };
  const snippet = buildWritableVideoSnippet(current, "New description");
  assert.deepEqual(snippet, {
    title: "A",
    categoryId: "26",
    description: "New description",
    tags: ["x", "y"],
    defaultLanguage: "en",
  });
  assert.equal("defaultAudioLanguage" in snippet, false);
  assert.equal("localized" in snippet, false);
  assert.equal("channelId" in snippet, false);
});

test("buildWritableVideoSnippet omits tags when absent — does not clear", () => {
  const current = {
    title: "A",
    categoryId: "26",
    description: "Old",
  };
  const snippet = buildWritableVideoSnippet(current, "New");
  assert.equal("tags" in snippet, false);
  assert.equal("defaultLanguage" in snippet, false);
});

test("update payload uses whitelisted snippet only", () => {
  const video = {
    title: "Crusty Bread",
    description: "Old description",
    categoryId: "22",
    tags: ["bread", "baking"],
    defaultLanguage: "en",
    defaultAudioLanguage: "en-US",
  };
  const payload = {
    id: "vid123",
    snippet: buildWritableVideoSnippet(video, "Updated chapters"),
  };
  assert.equal(payload.snippet.title, "Crusty Bread");
  assert.equal(payload.snippet.categoryId, "22");
  assert.deepEqual(payload.snippet.tags, ["bread", "baking"]);
  assert.equal(payload.snippet.defaultLanguage, "en");
  assert.equal(payload.snippet.description, "Updated chapters");
  assert.equal("defaultAudioLanguage" in payload.snippet, false);
  assert.equal("localized" in payload.snippet, false);
  assert.equal("channelId" in payload.snippet, false);
});

test("parseYoutubeSnippetReadModel keeps defaultAudioLanguage read-only", () => {
  const parsed = parseYoutubeSnippetReadModel({
    title: "T",
    description: "D",
    categoryId: "22",
    defaultAudioLanguage: "en-US",
    channelId: "UC123",
    publishedAt: "2020-01-01T00:00:00Z",
  });
  assert.equal(parsed.defaultAudioLanguage, "en-US");
  const writable = buildWritableVideoSnippet(parsed, "Next");
  assert.equal("defaultAudioLanguage" in writable, false);
  assert.equal("channelId" in writable, false);
});
