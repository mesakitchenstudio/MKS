import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildYoutubeChapterExport,
  DEFAULT_SYNTHETIC_INTRO_LABEL,
  evaluateYoutubeExportReadiness,
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

test("export A: synthetic intro when first canonical starts after 0", () => {
  const result = buildYoutubeChapterExport({
    videoId: "abc",
    instructions: baguetteSections,
    videoDurationSeconds: 420,
  });
  assert.equal(result.items[0]?.timestamp, 0);
  assert.equal(result.items[0]?.source, "synthetic_intro");
  assert.equal(result.items[0]?.label, DEFAULT_SYNTHETIC_INTRO_LABEL);
  assert.equal(result.items[1]?.timestamp, 12);
  assert.equal(result.items.length, 7);
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
