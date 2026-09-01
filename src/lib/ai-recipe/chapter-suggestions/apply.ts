import type { FieldSource } from "@/lib/ai-recipe/field-state";
import {
  isFieldLocked,
  resolveFieldReviewState,
} from "@/lib/ai-recipe/field-state";
import type { AiFieldProvenance } from "@/lib/ai-recipe/field-tracking";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import {
  hasCanonicalStartTimestamp,
  normalizeInstructionGroups,
  validateInstructionChapters,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";
import {
  instructionSnapshotFingerprint,
  sectionFingerprintMatches,
} from "@/lib/ai-recipe/chapter-suggestions/fingerprints";
import type {
  ChapterSuggestionBatch,
  ChapterSuggestionSelection,
  ChapterSuggestionSource,
  ChapterTimestampSuggestionItem,
  ApplyChapterSuggestionsResult,
} from "@/lib/ai-recipe/chapter-suggestions/types";
import type { StageAlignmentEvidenceLineage } from "@/lib/ai-recipe/chapter-suggestions/stage-alignment-evidence";
import { stageAlignmentLineageIsVideoDerived } from "@/lib/ai-recipe/chapter-suggestions/stage-alignment-evidence";

export function suggestionSourceToFieldSource(
  source: ChapterSuggestionSource,
  options?: { stageAlignmentLineage?: StageAlignmentEvidenceLineage },
): FieldSource {
  switch (source) {
    case "cached_video":
    case "transcript":
      return "from_video";
    case "stage_alignment":
      if (
        options?.stageAlignmentLineage &&
        stageAlignmentLineageIsVideoDerived(options.stageAlignmentLineage)
      ) {
        return "from_video";
      }
      return "inferred";
    default:
      return "inferred";
  }
}

export function buildProvenanceAfterChapterSuggestionApply(input: {
  path: string;
  value: unknown;
  source: FieldSource;
  previous?: AiFieldProvenance;
}): AiFieldProvenance {
  return {
    aiGenerated: true,
    aiGeneratedValue: input.value,
    humanModifiedAfterGeneration: false,
    reviewState: "confirmed",
    source: input.source,
    originalAi: input.previous?.originalAi ?? {
      value: input.value,
      source: input.source,
    },
  };
}

export function isChapterSuggestionBatchStale(
  batch: ChapterSuggestionBatch,
  groups: InstructionGroupWithChapters[],
): boolean {
  return batch.instructionSnapshotFingerprint !== instructionSnapshotFingerprint(groups);
}

export function computeDefaultChapterSuggestionSelections(input: {
  suggestions: ChapterTimestampSuggestionItem[];
  groups: InstructionGroupWithChapters[];
  aiMeta?: RecipeAiMeta | null;
}): ChapterSuggestionSelection[] {
  const selections: ChapterSuggestionSelection[] = [];

  for (const suggestion of input.suggestions) {
    if (suggestion.status === "no_evidence" || suggestion.status === "conflict") {
      continue;
    }
    if (suggestion.startTimestamp == null) continue;

    const group = input.groups[suggestion.instructionIndex];
    if (!group) continue;

    const startPath = `values.instructions.${suggestion.instructionIndex}.startTimestamp`;
    const labelPath = `values.instructions.${suggestion.instructionIndex}.chapterLabel`;
    const hasCanonical = hasCanonicalStartTimestamp(group);
    const startLocked = isFieldLocked(startPath, input.aiMeta ?? null);
    const labelLocked = isFieldLocked(labelPath, input.aiMeta ?? null);
    const startReview = resolveFieldReviewState(startPath, input.aiMeta ?? null);

    let applyStart = false;
    if (!startLocked && !hasCanonical) {
      if (suggestion.confidence === "high" || suggestion.confidence === "medium") {
        applyStart = true;
      }
    }

    if (hasCanonical && suggestion.startTimestamp === group.startTimestamp) {
      applyStart = false;
    }

    if (
      hasCanonical &&
      (startReview === "edited" || startReview === "confirmed" || startReview === "locked")
    ) {
      applyStart = false;
    }

    let applyChapterLabel = false;
    const suggestedLabel = suggestion.suggestedChapterLabel?.trim();
    const currentLabel = String(group.chapterLabel ?? "").trim();
    if (
      suggestedLabel &&
      suggestedLabel !== currentLabel &&
      !labelLocked &&
      !currentLabel
    ) {
      applyChapterLabel = suggestion.confidence === "high";
    }

    if (applyStart || applyChapterLabel) {
      selections.push({
        instructionIndex: suggestion.instructionIndex,
        applyStart,
        applyChapterLabel,
      });
    }
  }

  return selections;
}

export function applySelectedChapterSuggestions(input: {
  groups: InstructionGroupWithChapters[];
  batch: ChapterSuggestionBatch;
  selections: ChapterSuggestionSelection[];
  aiMeta?: RecipeAiMeta | null;
  videoDurationSeconds?: number;
}): ApplyChapterSuggestionsResult {
  if (isChapterSuggestionBatchStale(input.batch, input.groups)) {
    return {
      ok: false,
      message:
        "Instruction sections changed after suggestions were generated. Generate suggestions again.",
    };
  }

  const suggestionByIndex = new Map(
    input.batch.suggestions.map((row) => [row.instructionIndex, row] as const),
  );
  const next = normalizeInstructionGroups(input.groups).map((group) => ({ ...group }));
  const provenancePaths: Record<string, { source: FieldSource; value: unknown }> = {};
  const skipped: { instructionIndex: number; reason: string }[] = [];
  let appliedCount = 0;

  for (const selection of input.selections) {
    const suggestion = suggestionByIndex.get(selection.instructionIndex);
    const group = next[selection.instructionIndex];
    if (!suggestion || !group) {
      skipped.push({
        instructionIndex: selection.instructionIndex,
        reason: "Suggestion not found for section.",
      });
      continue;
    }

    if (
      !sectionFingerprintMatches(group, selection.instructionIndex, suggestion.sectionFingerprint)
    ) {
      skipped.push({
        instructionIndex: selection.instructionIndex,
        reason: "Instruction section changed after suggestions were generated.",
      });
      continue;
    }

    if (suggestion.status === "conflict" || suggestion.status === "no_evidence") {
      skipped.push({
        instructionIndex: selection.instructionIndex,
        reason: suggestion.conflictReason ?? "Suggestion is not applicable.",
      });
      continue;
    }

    const startPath = `values.instructions.${selection.instructionIndex}.startTimestamp`;
    const labelPath = `values.instructions.${selection.instructionIndex}.chapterLabel`;

    if (selection.applyStart) {
      if (isFieldLocked(startPath, input.aiMeta ?? null)) {
        skipped.push({
          instructionIndex: selection.instructionIndex,
          reason: "Start timestamp is locked.",
        });
      } else if (suggestion.startTimestamp != null) {
        group.startTimestamp = suggestion.startTimestamp;
        provenancePaths[startPath] = {
          source: suggestionSourceToFieldSource(suggestion.source, {
            stageAlignmentLineage: suggestion.stageAlignmentLineage,
          }),
          value: suggestion.startTimestamp,
        };
        appliedCount += 1;
      }
    }

    if (selection.applyChapterLabel && suggestion.suggestedChapterLabel?.trim()) {
      if (isFieldLocked(labelPath, input.aiMeta ?? null)) {
        skipped.push({
          instructionIndex: selection.instructionIndex,
          reason: "Chapter label is locked.",
        });
      } else {
        group.chapterLabel = suggestion.suggestedChapterLabel.trim();
        provenancePaths[labelPath] = {
          source: suggestionSourceToFieldSource(suggestion.source, {
            stageAlignmentLineage: suggestion.stageAlignmentLineage,
          }),
          value: group.chapterLabel,
        };
        appliedCount += 1;
      }
    }
  }

  const validation = validateInstructionChapters({
    groups: next,
    videoDurationSeconds: input.videoDurationSeconds,
  });
  const errors = validation.filter((issue) => issue.severity === "error");
  if (errors.length) {
    return {
      ok: false,
      message: errors[0]!.message,
      blockedIndexes: errors
        .map((issue) => issue.groupIndex)
        .filter((index): index is number => index != null),
    };
  }

  return {
    ok: true,
    groups: next,
    provenancePaths,
    appliedCount,
    skipped,
  };
}

export function countSelectedSuggestions(
  selections: ChapterSuggestionSelection[],
): number {
  return selections.filter((row) => row.applyStart || row.applyChapterLabel).length;
}

export function selectionForIndex(
  selections: ChapterSuggestionSelection[],
  instructionIndex: number,
): ChapterSuggestionSelection | undefined {
  return selections.find((row) => row.instructionIndex === instructionIndex);
}

export function toggleSuggestionSelection(
  selections: ChapterSuggestionSelection[],
  instructionIndex: number,
  field: "applyStart" | "applyChapterLabel",
  checked: boolean,
): ChapterSuggestionSelection[] {
  const existing = selections.find((row) => row.instructionIndex === instructionIndex);
  if (!existing) {
    if (!checked) return selections;
    return [
      ...selections,
      {
        instructionIndex,
        applyStart: field === "applyStart" ? true : false,
        applyChapterLabel: field === "applyChapterLabel" ? true : false,
      },
    ];
  }
  const next = selections.map((row) =>
    row.instructionIndex === instructionIndex
      ? {
          ...row,
          [field]: checked,
        }
      : row,
  );
  return next.filter((row) => row.applyStart || row.applyChapterLabel);
}
