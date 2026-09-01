import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { videoContentHealthStatus } from "./health.ts";

const base = {
  privacyStatus: "public",
  embeddable: true,
  hasDescriptionChapters: false,
  hasRecipeChapters: false,
};

describe("videoContentHealthStatus", () => {
  it("does not require chapters for Shorts", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "SHORT",
      }),
      "—",
    );
  });

  it("returns em dash for unknown format when unlinked", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        format: "UNKNOWN",
      }),
      "—",
    );
  });

  it("returns em dash for unknown format when linked without chapter evidence", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "UNKNOWN",
      }),
      "—",
    );
  });

  it("returns chapters ok for unknown format when linked with description chapters", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        hasDescriptionChapters: true,
        format: "UNKNOWN",
      }),
      "Chapters OK",
    );
  });

  it("returns em dash for unlinked long-form without evaluable recipe chapters", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        format: "LONG",
      }),
      "—",
    );
  });

  it("flags missing chapters for linked long-form", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "LONG",
      }),
      "Missing chapters",
    );
  });

  it("returns chapters ok for linked long-form with recipe chapters", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        hasRecipeChapters: true,
        format: "LONG",
      }),
      "Chapters OK",
    );
  });

  it("returns chapters ok for linked long-form with description chapters", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        hasDescriptionChapters: true,
        format: "LONG",
      }),
      "Chapters OK",
    );
  });
});
