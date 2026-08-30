import assert from "node:assert/strict";
import { test } from "node:test";
import {
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

test("enrichYoutubeBlobFromDescription keeps existing timestamps", () => {
  const confidenceByPath: Record<string, { confidence: "VERIFIED"; sourceNote: string }> = {};
  const summary = emptyAiSummary();
  const blob = enrichYoutubeBlobFromDescription({
    blob: { timestamps: [{ time: 13, label: "Existing chapter" }] },
    description: SAMPLE_DESCRIPTION,
    durationSeconds: 240,
    confidenceByPath,
    summary,
  });
  assert.deepEqual(blob?.timestamps, [{ time: 13, label: "Existing chapter" }]);
});
