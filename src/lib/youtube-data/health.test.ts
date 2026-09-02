import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { videoContentHealthStatus } from "./health.ts";

const base = {
  privacyStatus: "public",
  embeddable: true,
  hasDescriptionChapters: false,
  hasRecipeChapters: false,
};

const caesarValues = {
  instructions: [
    { name: "Make the Caesar Dressing", steps: ["a"] },
    { name: "Prepare the Chicken", steps: ["b"] },
    { name: "Assemble the Salad", steps: ["c"] },
    { name: "Finish and Serve", steps: ["d"] },
  ],
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

  it("returns em dash for unlinked long-form", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        format: "LONG",
      }),
      "—",
    );
  });

  it("returns Needs timestamps for linked long-form without mapped starts", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "LONG",
        recipeValues: caesarValues,
      }),
      "Needs timestamps",
    );
  });

  it("returns Chapters OK when all instruction timestamps are mapped", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "LONG",
        recipeValues: {
          instructions: caesarValues.instructions.map((row, index) => ({
            ...row,
            startTimestamp: index * 45,
          })),
        },
      }),
      "Chapters OK",
    );
  });

  it("returns Partially mapped when only some timestamps exist", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "LONG",
        recipeValues: {
          instructions: [
            { name: "Make the Caesar Dressing", steps: ["a"], startTimestamp: 0 },
            { name: "Prepare the Chicken", steps: ["b"] },
            { name: "Assemble the Salad", steps: ["c"] },
            { name: "Finish and Serve", steps: ["d"] },
          ],
        },
      }),
      "Partially mapped",
    );
  });

  it("returns Metadata issue before chapter mapping when flagged", () => {
    assert.equal(
      videoContentHealthStatus({
        ...base,
        linkedRecipeId: "r1",
        format: "LONG",
        hasMetadataIssue: true,
        recipeValues: caesarValues,
      }),
      "Metadata issue",
    );
  });
});
