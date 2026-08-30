import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildYoutubeBlobFromAi,
  normalizeAiYoutubeChapters,
} from "./youtube-chapters";
import { emptyAiSummary } from "./types";

test("normalizeAiYoutubeChapters sorts, dedupes times, and consolidates similar labels", () => {
  const chapters = normalizeAiYoutubeChapters(
    [
      { time: "01:22", label: "Knead with oil", confidence: "VERIFIED", sourceNote: "" },
      { time: "01:22", label: "Knead with oil", confidence: "ESTIMATED", sourceNote: "" },
      { time: "00:43", label: "Add flour and salt", confidence: "VERIFIED", sourceNote: "" },
    ],
    600,
  );
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].time, 43);
  assert.equal(chapters[1].time, 82);
});

test("buildYoutubeBlobFromAi produces duration and timestamps", () => {
  const confidenceByPath: Record<string, { confidence: "VERIFIED"; sourceNote: string }> = {};
  const summary = emptyAiSummary();
  const blob = buildYoutubeBlobFromAi({
    raw: {
      duration: { value: "5:34", confidence: "VERIFIED", sourceNote: "video runtime" },
      chapters: [
        { time: "00:13", label: "Mix milk and water", confidence: "VERIFIED", sourceNote: "00:13" },
        { time: "03:31", label: "Cook on the stovetop", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "" },
      ],
    },
    confidenceByPath,
    summary,
  });
  assert.ok(blob);
  assert.equal(blob?.duration, "05:34");
  assert.equal(Array.isArray(blob?.timestamps) ? blob?.timestamps.length : 0, 2);
  assert.ok(confidenceByPath["values.youtube.duration"]);
});
