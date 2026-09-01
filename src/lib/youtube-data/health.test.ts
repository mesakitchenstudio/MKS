import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { videoContentHealthStatus } from "./health.ts";

describe("videoContentHealthStatus", () => {
  it("does not require chapters for Shorts", () => {
    assert.equal(
      videoContentHealthStatus({
        privacyStatus: "public",
        embeddable: true,
        linkedRecipeId: "r1",
        hasDescriptionChapters: false,
        hasRecipeChapters: false,
        format: "SHORT",
      }),
      "—",
    );
  });

  it("flags missing chapters for linked long-form", () => {
    assert.equal(
      videoContentHealthStatus({
        privacyStatus: "public",
        embeddable: true,
        linkedRecipeId: "r1",
        hasDescriptionChapters: false,
        hasRecipeChapters: false,
        format: "LONG",
      }),
      "Missing chapters",
    );
  });
});
