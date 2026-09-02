import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  recipeChapterMappingFromValues,
  videoChapterMappingHealthStatus,
} from "./chapter-mapping-health.ts";

const caesarSections = [
  { name: "Make the Caesar Dressing", steps: ["Whisk dressing"] },
  { name: "Prepare the Chicken", steps: ["Season chicken"] },
  { name: "Assemble the Salad", steps: ["Toss greens"] },
  { name: "Finish and Serve", steps: ["Plate salad"] },
];

describe("chapter mapping health", () => {
  it("returns Needs timestamps for Caesar-style recipe with no mapped starts", () => {
    const values = { instructions: caesarSections };
    const { coverage, hasStructure } = recipeChapterMappingFromValues(values);
    assert.equal(hasStructure, true);
    assert.equal(coverage.totalSections, 4);
    assert.equal(coverage.mappedSections, 0);

    const status = videoChapterMappingHealthStatus({
      linkedRecipeId: "recipe-1",
      format: "LONG",
      recipeValues: values,
    });
    assert.equal(status, "Needs timestamps");
  });

  it("returns Partially mapped when some timestamps exist", () => {
    const values = {
      instructions: [
        { name: "Make the Caesar Dressing", steps: ["a"], startTimestamp: 0 },
        { name: "Prepare the Chicken", steps: ["b"] },
        { name: "Assemble the Salad", steps: ["c"], startTimestamp: 120 },
        { name: "Finish and Serve", steps: ["d"] },
      ],
    };
    const status = videoChapterMappingHealthStatus({
      linkedRecipeId: "recipe-1",
      format: "LONG",
      recipeValues: values,
    });
    assert.equal(status, "Partially mapped");
  });

  it("returns Chapters OK when all required starts are set", () => {
    const values = {
      instructions: caesarSections.map((section, index) => ({
        ...section,
        startTimestamp: index * 60,
      })),
    };
    const status = videoChapterMappingHealthStatus({
      linkedRecipeId: "recipe-1",
      format: "LONG",
      recipeValues: values,
    });
    assert.equal(status, "Chapters OK");
  });

  it("returns No chapter structure when sections lack titles", () => {
    const status = videoChapterMappingHealthStatus({
      linkedRecipeId: "recipe-1",
      format: "LONG",
      recipeValues: { instructions: [{ name: "", steps: ["a"] }] },
    });
    assert.equal(status, "No chapter structure");
  });
});
