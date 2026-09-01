import assert from "node:assert/strict";
import { test, mock } from "node:test";
import {
  fetchYoutubeVideoSnippetOAuth,
  mergeSnippetDescription,
  updateYoutubeVideoDescriptionOAuth,
} from "@/lib/youtube-data/video-snippet-oauth";

const sampleVideo = {
  id: "vid123",
  etag: "etag-old",
  snippet: {
    title: "Crusty Bread",
    description: "Old description",
    categoryId: "22",
    tags: ["bread", "baking"],
    defaultLanguage: "en",
    defaultAudioLanguage: "en",
  },
};

test("mergeSnippetDescription changes only description", () => {
  const merged = mergeSnippetDescription(sampleVideo, "New description");
  assert.equal(merged.description, "New description");
  assert.equal(merged.title, "Crusty Bread");
  assert.equal(merged.categoryId, "22");
  assert.deepEqual(merged.tags, ["bread", "baking"]);
});

test("updateYoutubeVideoDescriptionOAuth preserves snippet fields", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("videos?") && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as {
        snippet: { description: string; title: string; tags?: string[] };
      };
      return new Response(
        JSON.stringify({
          id: "vid123",
          etag: "etag-new",
          snippet: body.snippet,
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ items: [sampleVideo] }), { status: 200 });
  }) as typeof fetch;

  try {
    await updateYoutubeVideoDescriptionOAuth({
      accessToken: "token",
      video: sampleVideo,
      nextDescription: "Updated chapters\n0:00 Intro",
    });
    const putCall = calls.find((call) => call.init?.method === "PUT");
    assert.ok(putCall);
    const body = JSON.parse(String(putCall?.init?.body)) as {
      snippet: { description: string; title: string; categoryId: string; tags?: string[] };
    };
    assert.equal(body.snippet.description, "Updated chapters\n0:00 Intro");
    assert.equal(body.snippet.title, "Crusty Bread");
    assert.equal(body.snippet.categoryId, "22");
    assert.deepEqual(body.snippet.tags, ["bread", "baking"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchYoutubeVideoSnippetOAuth returns snippet", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(async () => {
    return new Response(
      JSON.stringify({
        items: [
          {
            id: "vid123",
            etag: "etag1",
            snippet: sampleVideo.snippet,
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const result = await fetchYoutubeVideoSnippetOAuth("token", "vid123");
    assert.ok(result);
    assert.equal(result?.snippet.title, "Crusty Bread");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
