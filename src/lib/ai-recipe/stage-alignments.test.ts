import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStageAlignmentsFromAnalysis,
  mesaCanonicalChaptersFromStageAlignments,
  parseStageAlignments,
} from "./stage-alignments";

test("mesaCanonicalChaptersFromStageAlignments keeps confident stages only", () => {
  const chapters = mesaCanonicalChaptersFromStageAlignments([
    {
      instructionStageId: "a",
      instructionSectionTitle: "Mix",
      videoStartSeconds: 0,
      videoTimestampLabel: "0:00",
      chapterTitle: "Foundation",
      confidence: "VERIFIED",
      source: "ai_video_analysis",
    },
    {
      instructionStageId: "b",
      instructionSectionTitle: "Fold",
      videoStartSeconds: 87,
      videoTimestampLabel: "1:27",
      chapterTitle: "Gluten",
      confidence: "UNKNOWN",
      source: "ai_video_analysis",
    },
    {
      instructionStageId: "c",
      instructionSectionTitle: "Bake",
      videoStartSeconds: 381,
      videoTimestampLabel: "6:21",
      chapterTitle: "Steam bake",
      confidence: "HIGH_CONFIDENCE_INFERENCE",
      source: "ai_video_analysis",
    },
  ]);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0]?.time, 0);
  assert.equal(chapters[1]?.time, 381);
});

test("six instruction stages can map with sparse YouTube hints", () => {
  const stages = [
    { id: "s0", name: "Initial Mix & Autolyse" },
    { id: "s1", name: "Activate Yeast & Incorporate" },
    { id: "s2", name: "Stretch and Fold Fermentation" },
    { id: "s3", name: "Divide and Pre-Shape" },
    { id: "s4", name: "Baguette Shaping & Proofing" },
    { id: "s5", name: "Scoring & Baking with Steam" },
  ];
  const alignments = buildStageAlignmentsFromAnalysis({
    instructionStages: stages,
    aiAlignments: [
      {
        instructionSectionTitle: "Initial Mix & Autolyse",
        videoStartSeconds: 0,
        chapterTitle: "Mix",
        confidence: "VERIFIED",
      },
      {
        instructionSectionTitle: "Activate Yeast & Incorporate",
        videoStartSeconds: 48,
        chapterTitle: "Yeast",
        confidence: "VERIFIED",
      },
      {
        instructionSectionTitle: "Stretch and Fold Fermentation",
        videoStartSeconds: 87,
        chapterTitle: "Fold",
        confidence: "VERIFIED",
      },
      {
        instructionSectionTitle: "Divide and Pre-Shape",
        videoStartSeconds: 197,
        chapterTitle: "Divide",
        confidence: "VERIFIED",
      },
      {
        instructionSectionTitle: "Baguette Shaping & Proofing",
        videoStartSeconds: 265,
        chapterTitle: "Shape",
        confidence: "VERIFIED",
      },
      {
        instructionSectionTitle: "Scoring & Baking with Steam",
        videoStartSeconds: 381,
        chapterTitle: "Bake",
        confidence: "VERIFIED",
      },
    ],
    youtubeHintChapters: [
      { time: 0, label: "The Foundation of Perfect Dough" },
      { time: 87, label: "The Secret to Gluten Development" },
      { time: 197, label: "Shaping for the Perfect Crumb" },
      { time: 381, label: "The Art of the Steam Bake" },
    ],
  });
  const chapters = mesaCanonicalChaptersFromStageAlignments(alignments);
  assert.equal(alignments.length, 6);
  assert.equal(chapters.length, 6);
});

test("parseStageAlignments rejects invalid times", () => {
  const rows = parseStageAlignments([
    { instructionSectionTitle: "Mix", videoStartSeconds: -1, chapterTitle: "Bad" },
    { instructionSectionTitle: "Bake", videoTimestampLabel: "nope", chapterTitle: "Bad" },
    { instructionSectionTitle: "Fold", videoStartSeconds: 10, chapterTitle: "Ok", confidence: "VERIFIED" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.videoStartSeconds, 10);
});
