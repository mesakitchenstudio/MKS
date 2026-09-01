import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySelectedChapterSuggestions,
  computeDefaultChapterSuggestionSelections,
  isChapterSuggestionBatchStale,
  suggestionSourceToFieldSource,
} from "@/lib/ai-recipe/chapter-suggestions/apply";
import {
  buildDeterministicChapterSuggestions,
  timestampComparisonLabel,
} from "@/lib/ai-recipe/chapter-suggestions/build";
import {
  collectChapterSuggestionEvidence,
  hasUsableChapterEvidence,
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

test("collectChapterSuggestionEvidence uses cached Gemini chapters", () => {
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
  assert.ok(hasUsableChapterEvidence(evidence));
});

test("insufficient evidence when no cached sources exist", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: { instructions: [{ name: "Mix", steps: ["a"] }] },
  });
  assert.equal(hasUsableChapterEvidence(evidence), false);
});

test("buildDeterministicChapterSuggestions fills missing section from stage alignment", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: {
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
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]!.instructionIndex, 4);
  assert.equal(suggestions[0]!.startTimestamp, 265);
  assert.equal(suggestions[0]!.status, "suggested");
});

test("noSuggestion when evidence cannot match section", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: {
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
      youtube: {
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
    assert.ok(result.provenancePaths["values.instructions.4.startTimestamp"]);
  }
});

test("provenance maps cached video evidence to from_video", () => {
  assert.equal(suggestionSourceToFieldSource("cached_video"), "from_video");
  assert.equal(suggestionSourceToFieldSource("semantic_inference"), "inferred");
});

test("conflict flagged when suggested timestamp is before previous section", () => {
  const evidence = collectChapterSuggestionEvidence({
    videoId: "abc123",
    values: {
      youtube: {
        stageAlignments: [
          {
            instructionStageId: "stage-4",
            instructionSectionTitle: "Baguette Shaping & Proofing",
            videoStartSeconds: 90,
            videoTimestampLabel: "1:30",
            chapterTitle: "Too early",
            confidence: "VERIFIED",
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
      youtube: {
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
  assert.equal(defaults.find((row) => row.instructionIndex === 4), undefined);
});
