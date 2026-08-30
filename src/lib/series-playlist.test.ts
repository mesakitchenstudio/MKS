import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { youtubePlaylistUrl } from "@/lib/youtube";

describe("youtube playlist helpers", () => {
  it("builds playlist URLs", () => {
    assert.equal(
      youtubePlaylistUrl("PLabcdefghijklmnop"),
      "https://www.youtube.com/playlist?list=PLabcdefghijklmnop",
    );
    assert.equal(youtubePlaylistUrl("  "), null);
    assert.equal(youtubePlaylistUrl(""), null);
  });
});
