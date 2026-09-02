import type { InstructionChapterCoverage } from "@/lib/instruction-chapters";
import {
  canonicalInstructionTimestampCoverage,
  hasInstructionSectionStructure,
  normalizeInstructionGroups,
} from "@/lib/instruction-chapters";
import type { VideoContentHealthStatus } from "@/lib/youtube-data/types";

export function recipeChapterMappingFromValues(
  values: Record<string, unknown> | null | undefined,
): {
  coverage: InstructionChapterCoverage;
  hasStructure: boolean;
} {
  const groups = normalizeInstructionGroups(values?.instructions);
  return {
    coverage: canonicalInstructionTimestampCoverage(groups),
    hasStructure: hasInstructionSectionStructure(groups),
  };
}

export function videoChapterMappingHealthStatus(input: {
  linkedRecipeId?: string;
  format: import("@/lib/youtube-data/video-format").YouTubeVideoFormat;
  hasMetadataIssue?: boolean;
  recipeValues?: Record<string, unknown> | null;
}): VideoContentHealthStatus | null {
  if (!input.linkedRecipeId) return null;
  if (input.format === "SHORT") return null;

  const { coverage, hasStructure } = recipeChapterMappingFromValues(input.recipeValues);

  if (input.format === "UNKNOWN") {
    if (!hasStructure || coverage.totalSections === 0) return null;
  }

  if (!hasStructure || coverage.totalSections === 0) {
    return "No chapter structure";
  }

  if (coverage.mappedSections >= coverage.totalSections) {
    return "Chapters OK";
  }
  if (coverage.mappedSections === 0) {
    return "Needs timestamps";
  }
  return "Partially mapped";
}
