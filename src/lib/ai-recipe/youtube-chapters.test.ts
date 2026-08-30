import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildYoutubeBlobFromAi,
  mergeRecipeYoutubeChapters,
  normalizeAiYoutubeChapters,
  aiChaptersFromGeminiRaw,
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

test("mergeRecipeYoutubeChapters enriches sparse description chapters with grounded AI stages", () => {
  const description = [
    { time: 0, label: "The Secret to Perfect No-Oven Bread", confidence: "VERIFIED", sourceNote: "yt" },
    { time: 42, label: "Transforming Texture Through Kneading", confidence: "VERIFIED", sourceNote: "yt" },
    { time: 137, label: "Shaping and Preparing Your Portions", confidence: "VERIFIED", sourceNote: "yt" },
    { time: 216, label: "The Pan-Frying Technique", confidence: "VERIFIED", sourceNote: "yt" },
  ];
  const ai = [
    { time: 0, label: "Introduction", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "video" },
    { time: 13, label: "Mix and knead the dough", confidence: "VERIFIED", sourceNote: "00:13" },
    { time: 42, label: "Knead the dough", confidence: "VERIFIED", sourceNote: "00:42" },
    { time: 95, label: "Proof the dough", confidence: "VERIFIED", sourceNote: "01:35" },
    { time: 137, label: "Divide and shape portions", confidence: "VERIFIED", sourceNote: "02:17" },
    { time: 180, label: "Roll the flatbreads", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "03:00" },
    { time: 216, label: "Cook on the stovetop", confidence: "VERIFIED", sourceNote: "03:36" },
    { time: 310, label: "Butter, garnish and serve", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "05:10" },
  ];

  const merged = mergeRecipeYoutubeChapters({
    descriptionChapters: description,
    aiChapters: ai,
    durationSeconds: 338,
  });

  assert.ok(merged.length >= 5 && merged.length <= 9);
  assert.equal(merged[0].time, 0);
  assert.match(merged[0].label, /intro/i);
  assert.ok(merged.some((chapter) => /proof/i.test(chapter.label)));
  assert.ok(merged.some((chapter) => /knead/i.test(chapter.label)));
  assert.ok(merged.some((chapter) => /cook|stovetop|fry/i.test(chapter.label)));
  assert.ok(merged.every((chapter) => chapter.time <= 338));
  assert.ok(!merged.some((chapter) => /secret to perfect/i.test(chapter.label)));
});

test("mergeRecipeYoutubeChapters ignores untrusted AI timestamps", () => {
  const merged = mergeRecipeYoutubeChapters({
    descriptionChapters: [{ time: 0, label: "Start", confidence: "VERIFIED", sourceNote: "yt" }],
    aiChapters: [{ time: 55, label: "Guess step", confidence: "ESTIMATED", sourceNote: "" }],
    durationSeconds: 120,
  });
  assert.equal(merged.length, 1);
});

test("aiChaptersFromGeminiRaw reads youtubeMetadata.chapters", () => {
  const chapters = aiChaptersFromGeminiRaw({
    youtubeMetadata: {
      chapters: [{ time: "01:05", label: "Proof the dough", confidence: "VERIFIED", sourceNote: "" }],
    },
  });
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].time, 65);
});
