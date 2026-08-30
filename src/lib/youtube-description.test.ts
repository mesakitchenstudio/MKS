import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enrichRecipeValuesYoutubeFromDescription,
  enrichYoutubeBlobFromDescription,
  parseYoutubeDescriptionChapters,
} from "./youtube-description";
import { emptyAiSummary } from "@/lib/ai-recipe/types";

const SAMPLE_DESCRIPTION = `
Instructions
Preparing the Dough
Resting the Dough

0:00 The Secret to Perfect No-Oven Bread
0:42 Transforming Texture Through Kneading
2:17 Shaping and Preparing Your Portions
3:36 The Pan-Frying Technique
`.trim();

test("parseYoutubeDescriptionChapters reads timestamp lines from description", () => {
  const chapters = parseYoutubeDescriptionChapters(SAMPLE_DESCRIPTION);
  assert.equal(chapters.length, 4);
  assert.equal(chapters[0].time, 0);
  assert.equal(chapters[0].label, "The Secret to Perfect No-Oven Bread");
  assert.equal(chapters[1].time, 42);
  assert.equal(chapters[3].time, 216);
  assert.equal(chapters[3].confidence, "VERIFIED");
});

test("enrichYoutubeBlobFromDescription fills missing timestamps from description", () => {
  const confidenceByPath: Record<string, { confidence: "VERIFIED"; sourceNote: string }> = {};
  const summary = emptyAiSummary();
  const blob = enrichYoutubeBlobFromDescription({
    blob: {},
    description: SAMPLE_DESCRIPTION,
    durationSeconds: 240,
    confidenceByPath,
    summary,
  });
  assert.ok(blob);
  assert.equal(blob?.duration, "04:00");
  assert.equal(Array.isArray(blob?.timestamps) ? blob?.timestamps.length : 0, 4);
  assert.ok(confidenceByPath["values.youtube.timestamps"]);
});

test("enrichRecipeValuesYoutubeFromDescription fills values.youtube on save", async () => {
  const values: Record<string, unknown> = {
    youtubeUrl: "https://www.youtube.com/watch?v=67Laso4MggU",
    youtube: {},
  };
  await enrichRecipeValuesYoutubeFromDescription(values);
  const blob = values.youtube as { timestamps?: { time: number; label: string }[]; duration?: string };
  assert.ok(Array.isArray(blob.timestamps) && blob.timestamps.length >= 4);
  assert.ok(blob.duration);
});

test("enrichYoutubeBlobFromDescription merges description chapters with existing AI timestamps", () => {
  const confidenceByPath: Record<string, { confidence: "VERIFIED"; sourceNote: string }> = {};
  const summary = emptyAiSummary();
  const blob = enrichYoutubeBlobFromDescription({
    blob: {
      timestamps: [{ time: 95, label: "Proof the dough" }],
    },
    description: SAMPLE_DESCRIPTION,
    durationSeconds: 338,
    aiChapters: [
      { time: 0, label: "Introduction", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "video" },
      { time: 42, label: "Knead the dough", confidence: "VERIFIED", sourceNote: "00:42" },
      { time: 95, label: "Proof the dough", confidence: "VERIFIED", sourceNote: "01:35" },
      { time: 137, label: "Divide and shape portions", confidence: "VERIFIED", sourceNote: "02:17" },
      { time: 216, label: "Cook on the stovetop", confidence: "VERIFIED", sourceNote: "03:36" },
    ],
    confidenceByPath,
    summary,
  });
  assert.ok(blob);
  const timestamps = blob?.timestamps as { time: number; label: string }[];
  assert.ok(Array.isArray(timestamps) && timestamps.length >= 5);
  assert.ok(timestamps.some((row) => row.time === 95 && /proof/i.test(row.label)));
  assert.ok(!timestamps.some((row) => /secret to perfect/i.test(row.label)));
});
