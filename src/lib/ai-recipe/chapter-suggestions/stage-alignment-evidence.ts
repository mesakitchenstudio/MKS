import type { RecipeStageAlignment } from "@/data/youtube-types";
import {
  hasCanonicalStartTimestamp,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";

/** Internal lineage for stageAlignment rows — never treat compatibility mirrors as video proof. */
export type StageAlignmentEvidenceLineage =
  | "derived_from_canonical"
  | "legacy_ai_video"
  | "youtube_description_hint"
  | "manual_unknown"
  | "unknown_legacy";

export type ClassifiedStageAlignmentEvidence = {
  alignment: RecipeStageAlignment;
  groupIndex: number;
  lineage: StageAlignmentEvidenceLineage;
};

export function classifyStageAlignmentLineage(input: {
  alignment: RecipeStageAlignment;
  groupIndex: number;
  group?: InstructionGroupWithChapters;
}): StageAlignmentEvidenceLineage {
  const { alignment, group } = input;

  if (
    group &&
    hasCanonicalStartTimestamp(group) &&
    group.startTimestamp === alignment.videoStartSeconds
  ) {
    return "derived_from_canonical";
  }

  if (alignment.source === "ai_video_analysis") {
    return "legacy_ai_video";
  }

  if (alignment.source === "youtube_description_hint") {
    return "youtube_description_hint";
  }

  if (alignment.source === "manual") {
    return "manual_unknown";
  }

  return "unknown_legacy";
}

export function classifyStageAlignmentEvidence(input: {
  alignments: RecipeStageAlignment[];
  groups: InstructionGroupWithChapters[];
}): ClassifiedStageAlignmentEvidence[] {
  const classified: ClassifiedStageAlignmentEvidence[] = [];

  for (let index = 0; index < input.groups.length; index += 1) {
    const group = input.groups[index]!;
    const id = `stage-${index}`;
    const title = String(group.name ?? "").trim().toLowerCase();
    const alignment =
      input.alignments.find((row) => row.instructionStageId === id) ??
      input.alignments.find((row) => row.instructionSectionTitle.toLowerCase().trim() === title);

    if (!alignment || alignment.videoStartSeconds < 0) continue;

    classified.push({
      alignment,
      groupIndex: index,
      lineage: classifyStageAlignmentLineage({ alignment, groupIndex: index, group }),
    });
  }

  for (const alignment of input.alignments) {
    const already = classified.some(
      (row) => row.alignment.instructionStageId === alignment.instructionStageId,
    );
    if (already) continue;
    if (alignment.videoStartSeconds < 0) continue;

    const titleIndex = input.groups.findIndex(
      (group) =>
        String(group.name ?? "").trim().toLowerCase() ===
        alignment.instructionSectionTitle.toLowerCase().trim(),
    );
    const groupIndex =
      titleIndex >= 0
        ? titleIndex
        : Number.parseInt(alignment.instructionStageId.replace(/^stage-/, ""), 10);
    const group = Number.isFinite(groupIndex) ? input.groups[groupIndex] : undefined;

    classified.push({
      alignment,
      groupIndex: Number.isFinite(groupIndex) ? groupIndex : -1,
      lineage: classifyStageAlignmentLineage({
        alignment,
        groupIndex: Number.isFinite(groupIndex) ? groupIndex : -1,
        group,
      }),
    });
  }

  return classified;
}

/** Compatibility mirrors of canonical timestamps must not feed back as independent evidence. */
export function usableStageAlignmentEvidence(
  classified: ClassifiedStageAlignmentEvidence[],
): ClassifiedStageAlignmentEvidence[] {
  return classified.filter((row) => row.lineage !== "derived_from_canonical");
}

/** Stage alignments Mesa may use as timestamp evidence (not AI video guesses). */
export function trustworthyStageAlignmentEvidence(
  classified: ClassifiedStageAlignmentEvidence[],
): ClassifiedStageAlignmentEvidence[] {
  return classified.filter(
    (row) =>
      row.lineage === "youtube_description_hint" || row.lineage === "manual_unknown",
  );
}

export function stageAlignmentLineageIsVideoDerived(
  lineage: StageAlignmentEvidenceLineage,
): boolean {
  return lineage === "legacy_ai_video";
}
