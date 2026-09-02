import type { FieldSource } from "@/lib/ai-recipe/field-state";

export type ChapterSuggestionMode = "missing" | "all";

export type ChapterSuggestionConfidence = "high" | "medium" | "low";

export type ChapterSuggestionSource =
  | "cached_video"
  | "transcript"
  | "stage_alignment"
  | "youtube_chapter_hint"
  | "legacy_timing"
  | "semantic_inference";

export type ChapterSuggestionStatus = "suggested" | "no_evidence" | "conflict";

export type ChapterTimestampSuggestionItem = {
  instructionIndex: number;
  sectionFingerprint: string;
  sectionTitle: string;
  chapterLabel?: string;
  suggestedChapterLabel?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  confidence: ChapterSuggestionConfidence;
  source: ChapterSuggestionSource;
  evidence?: string;
  reason?: string;
  status: ChapterSuggestionStatus;
  conflictReason?: string;
  /** Set when source is stage_alignment — drives safe apply provenance. */
  stageAlignmentLineage?: import("@/lib/ai-recipe/chapter-suggestions/stage-alignment-evidence").StageAlignmentEvidenceLineage;
};

export type ChapterSuggestionBatch = {
  requestId: string;
  generatedAt: string;
  mode: ChapterSuggestionMode;
  instructionSnapshotFingerprint: string;
  suggestions: ChapterTimestampSuggestionItem[];
  diagnostics?: ChapterSuggestionDiagnostics;
};

export type ChapterSuggestionDiagnostics = {
  strategy: "deterministic" | "deterministic+gemini";
  evidenceSources: string[];
  sectionsRequested: number;
  sectionsSuggested: number;
  sectionsNoEvidence: number;
  sectionsConflict: number;
  generationCacheUsed: boolean;
  geminiUsed: boolean;
  model?: string;
  latencyMs: number;
  /** Whether trustworthy timestamp sources were available for this batch. */
  timestampEvidenceAvailable?: boolean;
  suggestionKind?: "timestamps" | "titles";
};

export type ChapterSuggestionSelection = {
  instructionIndex: number;
  applyStart: boolean;
  applyChapterLabel: boolean;
};

export type ApplyChapterSuggestionsResult =
  | {
      ok: true;
      groups: import("@/lib/instruction-chapters").InstructionGroupWithChapters[];
      provenancePaths: Record<string, { source: FieldSource; value: unknown }>;
      appliedCount: number;
      skipped: { instructionIndex: number; reason: string }[];
    }
  | {
      ok: false;
      message: string;
      blockedIndexes?: number[];
    };
