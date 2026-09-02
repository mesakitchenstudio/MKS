import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { isTrustedInstructionStartTimestamp } from "@/lib/instruction-chapters";
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

function staffStartMeta(sectionCount: number): RecipeAiMeta {
  const fieldProvenance: RecipeAiMeta["fieldProvenance"] = {};
  for (let index = 0; index < sectionCount; index += 1) {
    fieldProvenance[`values.instructions.${index}.startTimestamp`] = {
      aiGenerated: false,
      humanModifiedAfterGeneration: true,
      reviewState: "edited",
      source: "staff",
    };
  }
  return {
    fieldProvenance,
    generatedByAI: false,
    verificationStatus: "unverified",
  };
}

function confirmedVideoStartMeta(sectionCount: number): RecipeAiMeta {
  const fieldProvenance: RecipeAiMeta["fieldProvenance"] = {};
  for (let index = 0; index < sectionCount; index += 1) {
    fieldProvenance[`values.instructions.${index}.startTimestamp`] = {
      aiGenerated: true,
      aiGeneratedValue: index * 60,
      humanModifiedAfterGeneration: false,
      reviewState: "confirmed",
      source: "from_video",
    };
  }
  return {
    fieldProvenance,
    generatedByAI: true,
    verificationStatus: "unverified",
  };
}

function inferredStartMeta(sectionCount: number): RecipeAiMeta {
  const fieldProvenance: RecipeAiMeta["fieldProvenance"] = {};
  for (let index = 0; index < sectionCount; index += 1) {
    fieldProvenance[`values.instructions.${index}.startTimestamp`] = {
      aiGenerated: true,
      aiGeneratedValue: index * 60,
      humanModifiedAfterGeneration: false,
      reviewState: "unreviewed",
      source: "inferred",
    };
  }
  return {
    fieldProvenance,
    generatedByAI: true,
    verificationStatus: "unverified",
  };
}

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

  it("does not treat legacy AI timestamps without provenance as Chapters OK", () => {
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
    assert.equal(status, "Needs timestamps");
  });

  it("does not treat inferred AI timestamps as trusted mappings", () => {
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
      recipeAiMeta: inferredStartMeta(4),
    });
    assert.equal(status, "Needs timestamps");
  });

  it("returns Partially mapped when some trusted timestamps exist", () => {
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
      recipeAiMeta: staffStartMeta(2),
    });
    assert.equal(status, "Partially mapped");
  });

  it("returns Chapters OK when all trusted staff mappings exist", () => {
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
      recipeAiMeta: staffStartMeta(4),
    });
    assert.equal(status, "Chapters OK");
  });

  it("counts confirmed AI video apply provenance as trusted", () => {
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
      recipeAiMeta: confirmedVideoStartMeta(4),
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

  it("staff manual mapping is trusted at field level", () => {
    const group = { name: "Mix", steps: ["a"], startTimestamp: 42 };
    const meta = staffStartMeta(1);
    assert.equal(isTrustedInstructionStartTimestamp(0, group, meta), true);
  });
});
