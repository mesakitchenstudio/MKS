import assert from "node:assert/strict";
import { test } from "node:test";
import type { RecipeStageAlignment } from "@/data/youtube-types";
import {
  canonicalChaptersFromInstructions,
  deriveStageAlignmentsFromCanonical,
  duplicateInstructionGroupForCopy,
  enrichRecipeValuesWithDerivedChapters,
  evaluateYoutubeChapterReadiness,
  formatTimestampInput,
  hasCanonicalInstructionChapters,
  instructionChapterCoverage,
  normalizeInstructionGroups,
  parseTimestampInput,
  resolveChapterLabel,
  resolveInstructionChapter,
  resolvePublicChapterTimestamps,
  validateInstructionChapters,
} from "./instruction-chapters";

test("formats seconds for admin display", () => {
  assert.equal(formatTimestampInput(0), "00:00");
  assert.equal(formatTimestampInput(87), "01:27");
  assert.equal(formatTimestampInput(3735), "1:02:15");
});

test("parses MM:SS and H:MM:SS", () => {
  assert.equal(parseTimestampInput("00:00"), 0);
  assert.equal(parseTimestampInput("01:27"), 87);
  assert.equal(parseTimestampInput("1:02:15"), 3735);
  assert.equal(parseTimestampInput("87"), 87);
});

test("rejects malformed timestamp input", () => {
  assert.equal(parseTimestampInput(""), null);
  assert.equal(parseTimestampInput("abc"), null);
  assert.equal(parseTimestampInput("1:99"), null);
  assert.equal(parseTimestampInput("1:2:99"), null);
});

test("InstructionGroup wins over stageAlignments", () => {
  const groups = [
    { name: "Mix", steps: ["a"], startTimestamp: 87, chapterLabel: "Mixing" },
    { name: "Bake", steps: ["b"] },
  ];
  const alignments: RecipeStageAlignment[] = [
    {
      instructionStageId: "stage-1",
      instructionSectionTitle: "Bake",
      videoStartSeconds: 200,
      videoTimestampLabel: "3:20",
      chapterTitle: "Bake",
      confidence: "VERIFIED",
      source: "manual",
    },
  ];
  const resolved = resolveInstructionChapter({
    group: groups[0]!,
    groupIndex: 0,
    allGroups: groups,
    stageAlignments: alignments,
  });
  assert.equal(resolved.startTimestamp, 87);
  assert.equal(resolved.source, "canonical");
  assert.equal(resolved.label, "Mixing");
});

test("falls back to stageAlignments when canonical absent", () => {
  const groups = [
    { name: "Mix", steps: ["a"], startTimestamp: 87, chapterLabel: "Mixing" },
    { name: "Bake", steps: ["b"] },
  ];
  const alignments: RecipeStageAlignment[] = [
    {
      instructionStageId: "stage-1",
      instructionSectionTitle: "Bake",
      videoStartSeconds: 200,
      videoTimestampLabel: "3:20",
      chapterTitle: "Bake",
      confidence: "VERIFIED",
      source: "manual",
    },
  ];
  const resolved = resolveInstructionChapter({
    group: groups[1]!,
    groupIndex: 1,
    allGroups: groups,
    stageAlignments: alignments,
  });
  assert.equal(resolved.startTimestamp, 200);
  assert.equal(resolved.source, "stage_alignment");
});

test("falls back to legacy timestamps", () => {
  const resolved = resolveInstructionChapter({
    group: { name: "Shape", steps: ["x"] },
    groupIndex: 0,
    allGroups: [{ name: "Shape", steps: ["x"] }],
    legacyTimestamps: [{ time: 120, label: "Shape" }],
  });
  assert.equal(resolved.startTimestamp, 120);
  assert.equal(resolved.source, "legacy_timestamp");
});

test("returns none when all chapter sources absent", () => {
  const resolved = resolveInstructionChapter({
    group: { name: "Empty", steps: ["x"] },
    groupIndex: 0,
    allGroups: [{ name: "Empty", steps: ["x"] }],
  });
  assert.equal(resolved.startTimestamp, undefined);
  assert.equal(resolved.source, "none");
});

test("explicit chapterLabel wins over section name", () => {
  assert.equal(
    resolveChapterLabel({ name: "Long Section Name", steps: [""], chapterLabel: "Short" }),
    "Short",
  );
});

test("blank chapterLabel falls back to section name", () => {
  assert.equal(
    resolveChapterLabel({ name: "Stretch and Fold", steps: [""], chapterLabel: "  " }),
    "Stretch and Fold",
  );
});

test("derived end uses next section start when end not explicit", () => {
  const groups = [
    { name: "One", steps: ["a"], startTimestamp: 12 },
    { name: "Two", steps: ["b"], startTimestamp: 64 },
    { name: "Three", steps: ["c"], startTimestamp: 197 },
  ];
  const resolved = resolveInstructionChapter({
    group: groups[0]!,
    groupIndex: 0,
    allGroups: groups,
  });
  assert.equal(resolved.endTimestamp, 64);
});

test("explicit end timestamp wins over derived end", () => {
  const group = { name: "One", steps: ["a"], startTimestamp: 12, endTimestamp: 50 };
  const resolved = resolveInstructionChapter({
    group,
    groupIndex: 0,
    allGroups: [group, { name: "Two", steps: ["b"], startTimestamp: 64 }],
  });
  assert.equal(resolved.endTimestamp, 50);
});

test("final section end uses video duration when known", () => {
  const groups = [
    { name: "One", steps: ["a"], startTimestamp: 12 },
    { name: "Two", steps: ["b"], startTimestamp: 64 },
    { name: "Three", steps: ["c"], startTimestamp: 197 },
  ];
  const resolved = resolveInstructionChapter({
    group: groups[2]!,
    groupIndex: 2,
    allGroups: groups,
    videoDurationSeconds: 400,
  });
  assert.equal(resolved.endTimestamp, 400);
});

test("validation allows incomplete chapter mappings", () => {
  const issues = validateInstructionChapters({
    groups: [
      { name: "A", steps: ["a"], startTimestamp: 12 },
      { name: "B", steps: ["b"] },
      { name: "C", steps: ["c"], startTimestamp: 197 },
    ],
  });
  assert.equal(issues.some((issue) => issue.severity === "error"), false);
});

test("validation flags end before start", () => {
  const issues = validateInstructionChapters({
    groups: [{ name: "Bad", steps: ["a"], startTimestamp: 50, endTimestamp: 40 }],
  });
  assert.equal(issues.some((issue) => issue.code === "end_before_start"), true);
});

test("validation flags non-monotonic section starts", () => {
  const issues = validateInstructionChapters({
    groups: [
      { name: "A", steps: ["a"], startTimestamp: 200 },
      { name: "B", steps: ["b"], startTimestamp: 100 },
    ],
  });
  assert.equal(issues.some((issue) => issue.code === "non_monotonic"), true);
});

test("save derives stageAlignments and timestamps from canonical data", () => {
  const values = enrichRecipeValuesWithDerivedChapters({
    instructions: [
      { name: "Mix", steps: ["a"], startTimestamp: 12, chapterLabel: "Mixing" },
      { name: "Bake", steps: ["b"], startTimestamp: 381 },
    ],
    youtube: { videoId: "abc" },
  });
  assert.equal(hasCanonicalInstructionChapters(normalizeInstructionGroups(values.instructions)), true);
  const blob = values.youtube as Record<string, unknown>;
  const alignments = blob.stageAlignments as RecipeStageAlignment[];
  assert.equal(alignments.length, 2);
  assert.equal(alignments[0]?.videoStartSeconds, 12);
  assert.equal(alignments[0]?.chapterTitle, "Mixing");
  const timestamps = blob.timestamps as { time: number; label: string }[];
  assert.deepEqual(
    timestamps.map((row) => row.time),
    [12, 381],
  );
});

test("save preserves legacy data when no canonical chapters", () => {
  const values = enrichRecipeValuesWithDerivedChapters({
    instructions: [{ name: "Mix", steps: ["a"] }],
    youtube: { timestamps: [{ time: 10, label: "Old" }] },
  });
  assert.equal((values.youtube as { timestamps: unknown[] }).timestamps.length, 1);
});

test("duplicate section copy clears timestamps", () => {
  const copy = duplicateInstructionGroupForCopy({
    name: "Mix",
    steps: ["a"],
    startTimestamp: 12,
    endTimestamp: 60,
    chapterLabel: "Mix",
  });
  assert.equal(copy.startTimestamp, undefined);
  assert.equal(copy.endTimestamp, undefined);
  assert.equal(copy.chapterLabel, "Mix");
});

test("chapter data travels with instruction group on reorder", () => {
  const groups = [
    { name: "A", steps: ["a"], startTimestamp: 12, chapterLabel: "Alpha" },
    { name: "B", steps: ["b"], startTimestamp: 64 },
  ];
  const reordered = [groups[1]!, groups[0]!];
  assert.equal(reordered[0]?.startTimestamp, 64);
  assert.equal(reordered[1]?.chapterLabel, "Alpha");
});

test("public resolution uses canonical chapters first", () => {
  const chapters = resolvePublicChapterTimestamps({
    instructions: [{ name: "A", steps: ["a"], startTimestamp: 87 }],
    stageAlignments: [],
    legacyTimestamps: [{ time: 10, label: "Legacy" }],
  });
  assert.deepEqual(chapters, [{ time: 87, label: "A" }]);
});

test("public chapter list omits unmapped sections", () => {
  const chapters = canonicalChaptersFromInstructions([
    { name: "A", steps: ["a"], startTimestamp: 12 },
    { name: "B", steps: ["b"] },
    { name: "C", steps: ["c"], startTimestamp: 197 },
  ]);
  assert.equal(chapters.length, 2);
});

test("YouTube readiness helper does not require Mesa completeness", () => {
  const result = evaluateYoutubeChapterReadiness([{ time: 18, label: "Start" }]);
  assert.equal(result.ready, false);
  assert.ok(result.issues.length > 0);
});

test("chapter coverage counts mapped sections", () => {
  const coverage = instructionChapterCoverage([
    { name: "A", steps: ["a"], startTimestamp: 12 },
    { name: "B", steps: ["b"] },
  ]);
  assert.equal(coverage.mappedSections, 1);
  assert.equal(coverage.missingTimestamps, 1);
});

test("chapter coverage in canonical mode ignores legacy fallbacks", () => {
  const coverage = instructionChapterCoverage(
    [
      { name: "A", steps: ["a"], startTimestamp: 12 },
      { name: "B", steps: ["b"] },
      { name: "C", steps: ["c"], startTimestamp: 197 },
    ],
    {
      stageAlignments: [
        {
          instructionStageId: "stage-1",
          instructionSectionTitle: "B",
          videoStartSeconds: 64,
          videoTimestampLabel: "1:04",
          chapterTitle: "B",
          confidence: "VERIFIED",
          source: "manual",
        },
      ],
    },
  );
  assert.equal(coverage.mappedSections, 2);
  assert.equal(coverage.missingTimestamps, 1);
});

test("deriveStageAlignmentsFromCanonical builds stage ids by instruction order", () => {
  const rows = deriveStageAlignmentsFromCanonical([
    { name: "First", steps: ["a"], startTimestamp: 0 },
  ]);
  assert.equal(rows[0]?.instructionStageId, "stage-0");
});

test("derived alignments drop when canonical section is removed", () => {
  const values = enrichRecipeValuesWithDerivedChapters({
    instructions: [{ name: "Only", steps: ["a"], startTimestamp: 42 }],
    youtube: {
      stageAlignments: [
        {
          instructionStageId: "stage-0",
          instructionSectionTitle: "Old",
          videoStartSeconds: 1,
          videoTimestampLabel: "0:01",
          chapterTitle: "Old",
          confidence: "VERIFIED",
          source: "manual",
        },
      ],
    },
  });
  const empty = enrichRecipeValuesWithDerivedChapters({
    instructions: [],
    youtube: values.youtube as Record<string, unknown>,
  });
  const alignments = (empty.youtube as { stageAlignments?: unknown[] }).stageAlignments ?? [];
  assert.equal(alignments.length, 0);
});

test("YouTube metadata refresh does not mutate canonical InstructionGroup chapter fields", async () => {
  const { applySyncedDescriptionChaptersToValues } = await import("./youtube-data/recipe-link");
  const values = {
    instructions: [
      {
        name: "Mix",
        steps: ["a"],
        startTimestamp: 87,
        endTimestamp: 120,
        chapterLabel: "Mixing",
      },
    ],
    youtube: { timestamps: [{ time: 10, label: "YouTube hint" }] },
  };
  const video = {
    videoId: "abc",
    title: "Test",
    description: "0:00 Intro\n1:00 Main\n2:00 Outro",
    thumbnailUrl: "",
    durationDisplay: "3:00",
    durationSeconds: 180,
    publishedAt: null,
    privacyStatus: "public",
    embeddable: true,
    tags: [],
  };
  const next = applySyncedDescriptionChaptersToValues(values, video, null);
  const group = (
    next.instructions as {
      startTimestamp?: number;
      endTimestamp?: number;
      chapterLabel?: string;
    }[]
  )[0];
  assert.equal(group?.startTimestamp, 87);
  assert.equal(group?.endTimestamp, 120);
  assert.equal(group?.chapterLabel, "Mixing");
});
