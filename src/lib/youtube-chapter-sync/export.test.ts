import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildYoutubeChapterExport,
  evaluateYoutubeExportReadiness,
  formatYoutubeChapterBlock,
  formatYoutubeChapterExportLine,
} from "@/lib/youtube-chapter-sync/export";

const baguetteSections = [
  { name: "Initial Mix & Autolyse", steps: [""], startTimestamp: 12 },
  { name: "Activate Yeast", steps: [""], startTimestamp: 64 },
  { name: "Stretch & Fold", steps: [""], startTimestamp: 87 },
  { name: "Divide & Pre-Shape", steps: [""], startTimestamp: 197 },
  { name: "Baguette Shaping", steps: [""], startTimestamp: 265 },
  { name: "Scoring & Bake", steps: [""], startTimestamp: 381 },
];

test("export A: first mapped section after 0 blocks export until staff maps 00:00", () => {
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: baguetteSections,
    videoDurationSeconds: 420,
  });
  assert.equal(result.items[0]?.timestamp, 12);
  assert.equal(result.items[0]?.source, "mesa_section");
  assert.equal(result.items.length, 6);
  assert.equal(result.ready, false);
  assert.equal(result.errors.some((issue) => issue.code === "first_not_zero"), true);
});

test("export B: no duplicate intro when first section starts at 0", () => {
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: [{ name: "Intro", steps: [""], startTimestamp: 0, chapterLabel: "Intro" }],
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.source, "mesa_section");
});

test("export C: partial mappings export only mapped sections", () => {
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: [
      { name: "A", steps: [""], startTimestamp: 0 },
      { name: "B", steps: [""] },
      { name: "C", steps: [""], startTimestamp: 120 },
    ],
    videoDurationSeconds: 300,
  });
  const mesa = result.items.filter((item) => item.source === "mesa_section");
  assert.equal(mesa.length, 2);
});

test("export D: label resolution prefers chapterLabel", () => {
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: [
      { name: "Section", steps: [""], startTimestamp: 0, chapterLabel: "Custom Label" },
      { name: "Next", steps: [""], startTimestamp: 30 },
      { name: "Third", steps: [""], startTimestamp: 60 },
    ],
    videoDurationSeconds: 120,
  });
  assert.match(result.items[0]?.label ?? "", /Custom Label/);
});

test("export E: readiness requires >= 3 chapters", () => {
  const readiness = evaluateYoutubeExportReadiness({
    items: [
      { timestamp: 0, label: "A", source: "synthetic_intro" },
      { timestamp: 20, label: "B", source: "mesa_section" },
    ],
  });
  assert.equal(readiness.ready, false);
});

test("export F: readiness rejects duplicate timestamps", () => {
  const readiness = evaluateYoutubeExportReadiness({
    items: [
      { timestamp: 0, label: "A", source: "synthetic_intro" },
      { timestamp: 30, label: "B", source: "mesa_section" },
      { timestamp: 30, label: "C", source: "mesa_section" },
    ],
  });
  assert.equal(readiness.ready, false);
});

test("export G: readiness enforces 10 second minimum gap", () => {
  const readiness = evaluateYoutubeExportReadiness({
    items: [
      { timestamp: 0, label: "Intro", source: "synthetic_intro" },
      { timestamp: 6, label: "Mix", source: "mesa_section" },
      { timestamp: 30, label: "Bake", source: "mesa_section" },
    ],
  });
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors[0]?.message ?? "", /6 seconds/);
});

test("export H: final chapter vs duration", () => {
  const readiness = evaluateYoutubeExportReadiness({
    items: [
      { timestamp: 0, label: "A", source: "synthetic_intro" },
      { timestamp: 15, label: "B", source: "mesa_section" },
      { timestamp: 30, label: "C", source: "mesa_section" },
    ],
    videoDurationSeconds: 35,
  });
  assert.equal(readiness.ready, false);
});

test("export I: empty labels fail readiness", () => {
  const readiness = evaluateYoutubeExportReadiness({
    items: [
      { timestamp: 0, label: "   ", source: "synthetic_intro" },
      { timestamp: 15, label: "B", source: "mesa_section" },
      { timestamp: 30, label: "C", source: "mesa_section" },
    ],
  });
  assert.equal(readiness.ready, false);
});

test("formatYoutubeChapterExportLine uses MM:SS under one hour", () => {
  assert.equal(formatYoutubeChapterExportLine(12, "Mix"), "00:12 Mix");
});

test("export J: preserves instruction array order when timestamps are non-monotonic", () => {
  const instructions = [
    { name: "Section A", steps: [""], startTimestamp: 47, chapterLabel: "A" },
    { name: "Section B", steps: [""], startTimestamp: 0, chapterLabel: "B" },
    { name: "Section C", steps: [""], startTimestamp: 89, chapterLabel: "C" },
  ];
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions,
    videoDurationSeconds: 300,
  });
  const mesa = result.items.filter((item) => item.source === "mesa_section");
  assert.deepEqual(
    mesa.map((item) => item.timestamp),
    [47, 0, 89],
  );
  assert.deepEqual(
    mesa.map((item) => item.instructionIndex),
    [0, 1, 2],
  );
  assert.equal(result.ready, false);
  assert.equal(
    result.errors.some((issue) => issue.code === "non_monotonic_canonical"),
    true,
  );
  assert.match(result.errors[0]?.message ?? "", /"B"/);
});

test("export K: does not sort export rows into ascending timestamp order", () => {
  const instructions = [
    { name: "Section A", steps: [""], startTimestamp: 47, chapterLabel: "A" },
    { name: "Section B", steps: [""], startTimestamp: 0, chapterLabel: "B" },
    { name: "Section C", steps: [""], startTimestamp: 89, chapterLabel: "C" },
  ];
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions,
    videoDurationSeconds: 300,
  });
  const timestamps = result.items.map((item) => item.timestamp);
  assert.notDeepEqual(timestamps, [0, 47, 89]);
  assert.deepEqual(timestamps, [47, 0, 89]);
});

test("export L: first mapped section after 0 is not export-ready without staff intro", () => {
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: [
      { name: "A", steps: [""], startTimestamp: 12, chapterLabel: "A" },
      { name: "B", steps: [""], startTimestamp: 64, chapterLabel: "B" },
      { name: "C", steps: [""], startTimestamp: 120, chapterLabel: "C" },
    ],
    videoDurationSeconds: 180,
  });
  assert.equal(result.items[0]?.source, "mesa_section");
  assert.equal(result.items[0]?.timestamp, 12);
  assert.equal(result.ready, false);
  assert.equal(result.errors.some((issue) => issue.code === "first_not_zero"), true);
});

test("export M: no synthetic intro when first mapped section starts at 0", () => {
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: [
      { name: "A", steps: [""], startTimestamp: 0, chapterLabel: "A" },
      { name: "B", steps: [""], startTimestamp: 47, chapterLabel: "B" },
    ],
    videoDurationSeconds: 120,
  });
  assert.equal(result.items.some((item) => item.source === "synthetic_intro"), false);
  assert.equal(result.items[0]?.timestamp, 0);
  assert.equal(result.items[0]?.label, "A");
  assert.equal(result.items[1]?.timestamp, 47);
});

test("export N: non-monotonic canonical structure remains blocked", () => {
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: [
      { name: "Initial Mix", steps: [""], startTimestamp: 47, chapterLabel: "Initial Mix" },
      { name: "Activate Yeast", steps: [""], startTimestamp: 0, chapterLabel: "Activate Yeast" },
      { name: "Shape", steps: [""], startTimestamp: 89, chapterLabel: "Shape" },
    ],
    videoDurationSeconds: 400,
  });
  assert.equal(result.items[0]?.source, "mesa_section");
  assert.equal(result.ready, false);
  assert.match(result.errors[0]?.message ?? "", /Activate Yeast/);
});

test("formatYoutubeChapterBlock preserves export item order", () => {
  const block = formatYoutubeChapterBlock([
    { timestamp: 47, label: "A", source: "mesa_section", instructionIndex: 0 },
    { timestamp: 0, label: "B", source: "mesa_section", instructionIndex: 1 },
    { timestamp: 89, label: "C", source: "mesa_section", instructionIndex: 2 },
  ]);
  assert.match(block, /^00:47 A/);
  assert.match(block, /\n00:00 B/);
  assert.match(block, /\n01:29 C/);
});

test("export O: 9-second gap is invalid", () => {
  const readiness = evaluateYoutubeExportReadiness({
    items: [
      { timestamp: 0, label: "A", source: "mesa_section" },
      { timestamp: 9, label: "B", source: "mesa_section" },
      { timestamp: 30, label: "C", source: "mesa_section" },
    ],
    videoDurationSeconds: 120,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.errors.some((issue) => issue.code === "min_gap"), true);
});

test("export P: 10-second gap is valid", () => {
  const readiness = evaluateYoutubeExportReadiness({
    items: [
      { timestamp: 0, label: "A", source: "mesa_section" },
      { timestamp: 10, label: "B", source: "mesa_section" },
      { timestamp: 30, label: "C", source: "mesa_section" },
    ],
    videoDurationSeconds: 120,
  });
  assert.equal(readiness.ready, true);
});

test("export Q: 14-second gap is valid with editorial warning", () => {
  const readiness = evaluateYoutubeExportReadiness({
    items: [
      { timestamp: 0, label: "A", source: "mesa_section" },
      { timestamp: 14, label: "B", source: "mesa_section" },
      { timestamp: 40, label: "C", source: "mesa_section" },
    ],
    videoDurationSeconds: 120,
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.warnings.some((issue) => issue.code === "short_gap"), true);
});

test("export R: first timestamp must be 00:00", () => {
  const readiness = evaluateYoutubeExportReadiness({
    items: [
      { timestamp: 12, label: "A", source: "mesa_section" },
      { timestamp: 30, label: "B", source: "mesa_section" },
      { timestamp: 60, label: "C", source: "mesa_section" },
    ],
    videoDurationSeconds: 120,
  });
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors[0]?.message ?? "", /00:00/);
});
