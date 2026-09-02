import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySelectedChapterSuggestions,
  computeDefaultChapterSuggestionSelections,
  isChapterSuggestionBatchStale,
  suggestionSourceToFieldSource,
} from "@/lib/ai-recipe/chapter-suggestions/apply";
import {
  buildChapterTitleSuggestions,
  buildDeterministicChapterSuggestions,
  timestampComparisonLabel,
} from "@/lib/ai-recipe/chapter-suggestions/build";
import {
  collectChapterSuggestionEvidence,
  hasUsableChapterEvidence,
  hasTrustworthyTimestampEvidence,
} from "@/lib/ai-recipe/chapter-suggestions/evidence";
import {
  instructionSectionFingerprint,
  instructionSnapshotFingerprint,
} from "@/lib/ai-recipe/chapter-suggestions/fingerprints";
import type { ChapterSuggestionBatch } from "@/lib/ai-recipe/chapter-suggestions/types";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";

const baguetteGroups = [
  { name: "Initial Mix & Autolyse", steps: ["Mix flour and water"], startTimestamp: 12 },
  { name: "Activate Yeast & Incorporate", steps: ["Add yeast"], startTimestamp: 64 },
  { name: "Stretch and Fold Fermentation", steps: ["Fold dough"], startTimestamp: 87 },
  { name: "Divide and Pre-Shape", steps: ["Divide"], startTimestamp: 197 },
  { name: "Baguette Shaping & Proofing", steps: ["Shape each piece into a baguette"] },
  { name: "Scoring & Baking with Steam", steps: ["Score and bake"], startTimestamp: 381 },
];

test("collectChapterSuggestionEvidence keeps cached Gemini chapters but not as timestamp evidence", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: { youtube: { duration: "6:21" } },
    cacheRaw: {
      youtubeMetadata: {
        chapters: [
          { time: "4:25", label: "Shape baguettes", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Shaping segment" },
        ],
      },
    },
  });
  assert.equal(evidence.cachedGeminiChapters.length, 1);
  assert.equal(evidence.generationCacheUsed, true);
  assert.equal(hasUsableChapterEvidence(evidence), false);
  assert.equal(hasTrustworthyTimestampEvidence(evidence), false);
});

test("insufficient evidence when no cached sources exist", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: { instructions: [{ name: "Mix", steps: ["a"] }] },
  });
  assert.equal(hasUsableChapterEvidence(evidence), false);
});

test("AI video stage alignments are not used as timestamp evidence", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: {
      instructions: baguetteGroups,
      youtube: {
        duration: "6:21",
        stageAlignments: [
          {
            instructionStageId: "stage-4",
            instructionSectionTitle: "Baguette Shaping & Proofing",
            videoStartSeconds: 265,
            videoTimestampLabel: "4:25",
            chapterTitle: "Shaping",
            confidence: "HIGH_CONFIDENCE_INFERENCE",
            source: "ai_video_analysis",
          },
        ],
      },
    },
  });
  const suggestions = buildDeterministicChapterSuggestions({
    groups: baguetteGroups,
    evidence,
    mode: "missing",
  });
  const shaping = suggestions.find((row) => row.instructionIndex === 4);
  assert.equal(shaping?.startTimestamp, undefined);
  assert.equal(shaping?.status, "no_evidence");
});

test("buildChapterTitleSuggestions never fabricates timestamps", () => {
  const groups = [
    { name: "Make the Caesar Dressing", steps: ["a"] },
    { name: "Prepare the Chicken", steps: ["b"] },
  ];
  const suggestions = buildChapterTitleSuggestions({ groups, mode: "missing" });
  assert.equal(suggestions.length, 2);
  for (const row of suggestions) {
    assert.equal(row.startTimestamp, undefined);
    assert.ok(row.suggestedChapterLabel);
  }
});

test("noSuggestion when evidence cannot match section", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: {
      instructions: baguetteGroups,
      youtube: {
        stageAlignments: [
          {
            instructionStageId: "stage-9",
            instructionSectionTitle: "Unrelated",
            videoStartSeconds: 10,
            videoTimestampLabel: "0:10",
            chapterTitle: "Other",
            confidence: "UNKNOWN",
            source: "ai_video_analysis",
          },
        ],
      },
    },
  });
  const suggestions = buildDeterministicChapterSuggestions({
    groups: [{ name: "Unique Section", steps: ["Do thing"] }],
    evidence,
    mode: "missing",
  });
  assert.equal(suggestions[0]!.status, "no_evidence");
});

test("section fingerprint changes when section text changes", () => {
  const a = instructionSectionFingerprint({ name: "Mix", steps: ["a"] }, 0);
  const b = instructionSectionFingerprint({ name: "Mix", steps: ["b"] }, 0);
  assert.notEqual(a, b);
});

test("stale batch rejected on apply after reorder", () => {
  const batch: ChapterSuggestionBatch = {
    requestId: "r1",
    generatedAt: new Date().toISOString(),
    mode: "missing",
    instructionSnapshotFingerprint: instructionSnapshotFingerprint(baguetteGroups),
    suggestions: [
      {
        instructionIndex: 4,
        sectionFingerprint: instructionSectionFingerprint(baguetteGroups[4]!, 4),
        sectionTitle: "Baguette Shaping & Proofing",
        startTimestamp: 265,
        confidence: "medium",
        source: "stage_alignment",
        status: "suggested",
      },
    ],
  };
  const reordered = [...baguetteGroups];
  reordered[4] = { ...reordered[4]!, name: "Renamed Section" };
  assert.equal(isChapterSuggestionBatchStale(batch, reordered), true);
  const result = applySelectedChapterSuggestions({
    groups: reordered,
    batch,
    selections: [{ instructionIndex: 4, applyStart: true, applyChapterLabel: false }],
  });
  assert.equal(result.ok, false);
});

test("default selection checks missing high/medium and skips existing canonical", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: {
      instructions: baguetteGroups,
      youtube: {
        stageAlignments: [
          {
            instructionStageId: "stage-4",
            instructionSectionTitle: "Baguette Shaping & Proofing",
            videoStartSeconds: 265,
            videoTimestampLabel: "4:25",
            chapterTitle: "Shaping",
            confidence: "VERIFIED",
            source: "manual",
          },
        ],
      },
    },
  });
  const suggestions = buildDeterministicChapterSuggestions({
    groups: baguetteGroups,
    evidence,
    mode: "all",
  });
  const defaults = computeDefaultChapterSuggestionSelections({
    suggestions,
    groups: baguetteGroups,
    aiMeta: null,
  });
  const missing = defaults.find((row) => row.instructionIndex === 4);
  assert.ok(missing?.applyStart);
  const existing = defaults.find((row) => row.instructionIndex === 2);
  assert.equal(existing, undefined);
});

test("apply selected updates only chosen sections locally", () => {
  const batch: ChapterSuggestionBatch = {
    requestId: "r1",
    generatedAt: new Date().toISOString(),
    mode: "missing",
    instructionSnapshotFingerprint: instructionSnapshotFingerprint(baguetteGroups),
    suggestions: [
      {
        instructionIndex: 4,
        sectionFingerprint: instructionSectionFingerprint(baguetteGroups[4]!, 4),
        sectionTitle: "Baguette Shaping & Proofing",
        startTimestamp: 265,
        confidence: "medium",
        source: "stage_alignment",
        stageAlignmentLineage: "manual_unknown",
        status: "suggested",
      },
    ],
  };
  const result = applySelectedChapterSuggestions({
    groups: baguetteGroups,
    batch,
    selections: [{ instructionIndex: 4, applyStart: true, applyChapterLabel: false }],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.groups[4]!.startTimestamp, 265);
    assert.equal(result.groups[0]!.startTimestamp, 12);
    assert.equal(
      result.provenancePaths["values.instructions.4.startTimestamp"]?.source,
      "inferred",
    );
  }
});

test("provenance maps cached video evidence to from_video", () => {
  assert.equal(suggestionSourceToFieldSource("cached_video"), "from_video");
  assert.equal(suggestionSourceToFieldSource("semantic_inference"), "inferred");
  assert.equal(
    suggestionSourceToFieldSource("stage_alignment", { stageAlignmentLineage: "legacy_ai_video" }),
    "inferred",
  );
  assert.equal(
    suggestionSourceToFieldSource("stage_alignment", { stageAlignmentLineage: "manual_unknown" }),
    "inferred",
  );
  assert.equal(
    suggestionSourceToFieldSource("stage_alignment", { stageAlignmentLineage: "unknown_legacy" }),
    "inferred",
  );
  assert.equal(suggestionSourceToFieldSource("youtube_chapter_hint"), "from_video");
});

test("conflict flagged when suggested timestamp is before previous section", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: {
      instructions: baguetteGroups,
      youtube: {
        stageAlignments: [
          {
            instructionStageId: "stage-4",
            instructionSectionTitle: "Baguette Shaping & Proofing",
            videoStartSeconds: 90,
            videoTimestampLabel: "1:30",
            chapterTitle: "Too early",
            confidence: "VERIFIED",
            source: "manual",
          },
        ],
      },
    },
  });
  const suggestions = buildDeterministicChapterSuggestions({
    groups: baguetteGroups,
    evidence,
    mode: "missing",
  });
  assert.equal(suggestions[0]!.status, "conflict");
});

test("timestampComparisonLabel describes close and exact matches", () => {
  assert.equal(timestampComparisonLabel(87, 87), "Matches current");
  assert.equal(timestampComparisonLabel(87, 88), "Close match");
  assert.equal(timestampComparisonLabel(87, 92), "+5 sec");
});

test("locked field is not default-selected", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: {
      instructions: baguetteGroups,
      youtube: {
        stageAlignments: [
          {
            instructionStageId: "stage-4",
            instructionSectionTitle: "Baguette Shaping & Proofing",
            videoStartSeconds: 265,
            videoTimestampLabel: "4:25",
            chapterTitle: "Shaping",
            confidence: "VERIFIED",
            source: "manual",
          },
        ],
      },
    },
  });
  const suggestions = buildDeterministicChapterSuggestions({
    groups: baguetteGroups,
    evidence,
    mode: "missing",
  });
  const aiMeta = {
    fieldProvenance: {
      "values.instructions.4.startTimestamp": {
        aiGenerated: true,
        aiGeneratedValue: 0,
        humanModifiedAfterGeneration: false,
        reviewState: "locked",
      },
    },
  } as RecipeAiMeta;
  const defaults = computeDefaultChapterSuggestionSelections({
    suggestions,
    groups: baguetteGroups,
    aiMeta,
  });
  const locked = defaults.find((row) => row.instructionIndex === 4);
  assert.ok(!locked?.applyStart);
});

test("derived canonical stageAlignment is excluded from suggestion evidence", () => {
  const groups = [
    { name: "Section A", steps: ["a"], startTimestamp: 265 },
    { name: "Section B", steps: ["b"] },
  ];
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: {
      instructions: groups,
      youtube: {
        stageAlignments: [
          {
            instructionStageId: "stage-0",
            instructionSectionTitle: "Section A",
            videoStartSeconds: 265,
            videoTimestampLabel: "4:25",
            chapterTitle: "Section A",
            confidence: "VERIFIED",
            source: "manual",
          },
        ],
      },
    },
  });
  assert.equal(evidence.trustworthyStageAlignments.length, 0);
});

test("staff canonical timestamp cannot round-trip as from_video via derived stageAlignment", () => {
  const groups = [
    { name: "Staff Section", steps: ["mix"], startTimestamp: 120 },
    { name: "Missing Section", steps: ["shape"] },
  ];
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: {
      instructions: groups,
      youtube: {
        stageAlignments: [
          {
            instructionStageId: "stage-0",
            instructionSectionTitle: "Staff Section",
            videoStartSeconds: 120,
            videoTimestampLabel: "2:00",
            chapterTitle: "Staff Section",
            confidence: "VERIFIED",
            source: "manual",
          },
          {
            instructionStageId: "stage-1",
            instructionSectionTitle: "Missing Section",
            videoStartSeconds: 200,
            videoTimestampLabel: "3:20",
            chapterTitle: "Missing Section",
            confidence: "VERIFIED",
            source: "manual",
          },
        ],
      },
    },
  });
  const suggestions = buildDeterministicChapterSuggestions({
    groups,
    evidence,
    mode: "missing",
  });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]!.instructionIndex, 1);
  assert.equal(suggestions[0]!.stageAlignmentLineage, "manual_unknown");
  const result = applySelectedChapterSuggestions({
    groups,
    batch: {
      requestId: "r1",
      generatedAt: new Date().toISOString(),
      mode: "missing",
      instructionSnapshotFingerprint: instructionSnapshotFingerprint(groups),
      suggestions,
    },
    selections: [{ instructionIndex: 1, applyStart: true, applyChapterLabel: false }],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      result.provenancePaths["values.instructions.1.startTimestamp"]?.source,
      "inferred",
    );
  }
});

test("youtube description chapter match applies as from_video", () => {
  const groups = [{ name: "Shape loaves", steps: ["shape"] }];
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: { instructions: groups, youtube: { duration: "8:00" } },
    youtubeDescription: "4:25 Shape loaves\nMore text",
  });
  const suggestions = buildDeterministicChapterSuggestions({
    groups,
    evidence,
    mode: "missing",
  });
  assert.equal(suggestions[0]!.source, "youtube_chapter_hint");
  const result = applySelectedChapterSuggestions({
    groups,
    batch: {
      requestId: "r2",
      generatedAt: new Date().toISOString(),
      mode: "missing",
      instructionSnapshotFingerprint: instructionSnapshotFingerprint(groups),
      suggestions,
    },
    selections: [{ instructionIndex: 0, applyStart: true, applyChapterLabel: false }],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      result.provenancePaths["values.instructions.0.startTimestamp"]?.source,
      "from_video",
    );
  }
});
