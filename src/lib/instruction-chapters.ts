import type { InstructionGroup } from "@/data/types";
import type { RecipeStageAlignment, RecipeYoutubeTimestamp } from "@/data/youtube-types";
import {
  resolveFieldReviewState,
  resolveFieldSource,
} from "@/lib/ai-recipe/field-state";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { formatTimestampInput, parseTimestampInput } from "@/lib/youtube-metadata-editor";

/** Instruction section with optional Mesa canonical video chapter fields (seconds internally). */
export type InstructionGroupWithChapters = InstructionGroup & {
  chapterLabel?: string;
  startTimestamp?: number;
  endTimestamp?: number;
};

export type InstructionChapterSource =
  | "canonical"
  | "stage_alignment"
  | "legacy_timestamp"
  | "youtube_hint"
  | "none";

export type ResolvedInstructionChapter = {
  label: string;
  startTimestamp?: number;
  endTimestamp?: number;
  source: InstructionChapterSource;
  /** Where the effective start timestamp came from (may differ when end is derived). */
  startSource: InstructionChapterSource;
};

export type InstructionChapterValidationIssue = {
  code: string;
  message: string;
  groupIndex?: number;
  severity: "error" | "warning";
};

export type InstructionChapterCoverage = {
  totalSections: number;
  mappedSections: number;
  missingTimestamps: number;
  /** Sections with a usable chapter/section title. */
  titledSections: number;
};

export function countTitledInstructionSections(groups: InstructionGroupWithChapters[]): number {
  let count = 0;
  for (const group of groups) {
    if (resolveChapterLabel(group).trim()) count += 1;
  }
  return count;
}

/** Canonical instruction-group start timestamps only — editor display / legacy counts. */
export function canonicalInstructionTimestampCoverage(
  groups: InstructionGroupWithChapters[],
): InstructionChapterCoverage {
  const totalSections = groups.length;
  let mappedSections = 0;
  for (const group of groups) {
    if (hasCanonicalStartTimestamp(group)) mappedSections += 1;
  }
  return {
    totalSections,
    mappedSections,
    missingTimestamps: totalSections - mappedSections,
    titledSections: countTitledInstructionSections(groups),
  };
}

/**
 * True when a canonical start timestamp has a trustworthy source for dashboard health.
 * Presence of startTimestamp alone is insufficient — provenance must be staff or confirmed video.
 */
export function isTrustedInstructionStartTimestamp(
  groupIndex: number,
  group: InstructionGroupWithChapters,
  aiMeta?: RecipeAiMeta | null,
): boolean {
  if (!hasCanonicalStartTimestamp(group)) return false;

  const path = `values.instructions.${groupIndex}.startTimestamp`;
  const provenance = aiMeta?.fieldProvenance?.[path];
  if (!provenance) return false;

  const source = resolveFieldSource(path, aiMeta);
  const reviewState = resolveFieldReviewState(path, aiMeta);

  if (source === "staff") return true;

  if (source === "from_video") {
    return (
      reviewState === "confirmed" ||
      reviewState === "locked" ||
      provenance.humanModifiedAfterGeneration === true
    );
  }

  return false;
}

/** Trusted timestamp coverage for YouTube chapter-mapping health. */
export function trustedInstructionTimestampCoverage(
  groups: InstructionGroupWithChapters[],
  aiMeta?: RecipeAiMeta | null,
): InstructionChapterCoverage {
  const totalSections = groups.length;
  let mappedSections = 0;
  for (let index = 0; index < groups.length; index += 1) {
    if (isTrustedInstructionStartTimestamp(index, groups[index]!, aiMeta)) {
      mappedSections += 1;
    }
  }
  return {
    totalSections,
    mappedSections,
    missingTimestamps: totalSections - mappedSections,
    titledSections: countTitledInstructionSections(groups),
  };
}

export function hasInstructionSectionStructure(groups: InstructionGroupWithChapters[]): boolean {
  return countTitledInstructionSections(groups) > 0;
}

export function normalizeInstructionGroups(raw: unknown): InstructionGroupWithChapters[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeInstructionGroup);
}

export function normalizeInstructionGroup(raw: unknown): InstructionGroupWithChapters {
  if (!raw || typeof raw !== "object") {
    return { name: "", steps: [""] };
  }
  const row = raw as Record<string, unknown>;
  const steps = Array.isArray(row.steps)
    ? row.steps.map((step) => String(step ?? ""))
    : [""];
  const group: InstructionGroupWithChapters = {
    name: typeof row.name === "string" ? row.name : "",
    steps: steps.length ? steps : [""],
  };
  if (typeof row.chapterLabel === "string" && row.chapterLabel.trim()) {
    group.chapterLabel = row.chapterLabel;
  }
  const start = coerceTimestampSeconds(row.startTimestamp);
  if (start != null) group.startTimestamp = start;
  const end = coerceTimestampSeconds(row.endTimestamp);
  if (end != null) group.endTimestamp = end;
  return group;
}

function coerceTimestampSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    return parseTimestampInput(value);
  }
  return null;
}

export function hasCanonicalStartTimestamp(group: InstructionGroupWithChapters): boolean {
  return typeof group.startTimestamp === "number" && group.startTimestamp >= 0;
}

export function hasCanonicalInstructionChapters(groups: InstructionGroupWithChapters[]): boolean {
  return groups.some(hasCanonicalStartTimestamp);
}

/** Resolved public-facing chapter label: explicit chapterLabel, else section name. */
export function resolveChapterLabel(group: InstructionGroupWithChapters): string {
  const explicit = String(group.chapterLabel ?? "").trim();
  if (explicit) return explicit;
  return String(group.name ?? "").trim();
}

function stageIdForIndex(index: number) {
  return `stage-${index}`;
}

function findStageAlignment(
  groupIndex: number,
  group: InstructionGroupWithChapters,
  alignments: RecipeStageAlignment[],
): RecipeStageAlignment | undefined {
  const id = stageIdForIndex(groupIndex);
  const title = String(group.name ?? "").trim().toLowerCase();
  return (
    alignments.find((row) => row.instructionStageId === id) ??
    alignments.find((row) => row.instructionSectionTitle.toLowerCase().trim() === title)
  );
}

function findLegacyTimestamp(
  groupIndex: number,
  group: InstructionGroupWithChapters,
  timestamps: RecipeYoutubeTimestamp[],
): RecipeYoutubeTimestamp | undefined {
  const title = String(group.name ?? "").trim().toLowerCase();
  const byTitle = timestamps.find((row) => row.label.toLowerCase().trim() === title);
  if (byTitle) return byTitle;
  const sorted = [...timestamps].sort((a, b) => a.time - b.time);
  return sorted[groupIndex];
}

function resolveStartFromSources(input: {
  group: InstructionGroupWithChapters;
  groupIndex: number;
  stageAlignments?: RecipeStageAlignment[];
  legacyTimestamps?: RecipeYoutubeTimestamp[];
}): { start?: number; source: InstructionChapterSource } {
  if (hasCanonicalStartTimestamp(input.group)) {
    return { start: input.group.startTimestamp, source: "canonical" };
  }
  const alignment = findStageAlignment(
    input.groupIndex,
    input.group,
    input.stageAlignments ?? [],
  );
  if (alignment && alignment.videoStartSeconds >= 0) {
    return { start: alignment.videoStartSeconds, source: "stage_alignment" };
  }
  const legacy = findLegacyTimestamp(
    input.groupIndex,
    input.group,
    input.legacyTimestamps ?? [],
  );
  if (legacy && legacy.time >= 0) {
    return { start: legacy.time, source: "legacy_timestamp" };
  }
  return { source: "none" };
}

/**
 * Resolve one instruction section's effective Mesa chapter (runtime; no write-on-read).
 * Precedence: InstructionGroup → stageAlignments → legacy youtube.timestamps.
 */
export function resolveInstructionChapter(input: {
  group: InstructionGroupWithChapters;
  groupIndex: number;
  allGroups: InstructionGroupWithChapters[];
  stageAlignments?: RecipeStageAlignment[];
  legacyTimestamps?: RecipeYoutubeTimestamp[];
  videoDurationSeconds?: number;
}): ResolvedInstructionChapter {
  const label = resolveChapterLabel(input.group) || `Section ${input.groupIndex + 1}`;
  const startResolved = resolveStartFromSources(input);

  let endTimestamp: number | undefined;
  if (typeof input.group.endTimestamp === "number" && input.group.endTimestamp >= 0) {
    endTimestamp = input.group.endTimestamp;
  } else if (startResolved.start != null) {
    const nextStart = resolveNextSectionStart(input);
    if (nextStart != null) {
      endTimestamp = nextStart;
    } else if (
      input.groupIndex === input.allGroups.length - 1 &&
      input.videoDurationSeconds != null &&
      input.videoDurationSeconds > 0
    ) {
      endTimestamp = input.videoDurationSeconds;
    }
  }

  return {
    label,
    startTimestamp: startResolved.start,
    endTimestamp,
    source: startResolved.source,
    startSource: startResolved.source,
  };
}

function resolveNextSectionStart(input: {
  groupIndex: number;
  allGroups: InstructionGroupWithChapters[];
  stageAlignments?: RecipeStageAlignment[];
  legacyTimestamps?: RecipeYoutubeTimestamp[];
}): number | null {
  for (let index = input.groupIndex + 1; index < input.allGroups.length; index += 1) {
    const next = resolveStartFromSources({
      group: input.allGroups[index]!,
      groupIndex: index,
      stageAlignments: input.stageAlignments,
      legacyTimestamps: input.legacyTimestamps,
    });
    if (next.start != null) return next.start;
  }
  return null;
}

export function instructionChapterCoverage(
  groups: InstructionGroupWithChapters[],
  context?: {
    stageAlignments?: RecipeStageAlignment[];
    legacyTimestamps?: RecipeYoutubeTimestamp[];
  },
): InstructionChapterCoverage {
  const totalSections = groups.length;
  const canonicalMode = hasCanonicalInstructionChapters(groups);
  let mappedSections = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    if (canonicalMode) {
      if (hasCanonicalStartTimestamp(group)) mappedSections += 1;
      continue;
    }
    const resolved = resolveInstructionChapter({
      group,
      groupIndex: index,
      allGroups: groups,
      stageAlignments: context?.stageAlignments,
      legacyTimestamps: context?.legacyTimestamps,
    });
    if (resolved.startTimestamp != null) mappedSections += 1;
  }
  return {
    totalSections,
    mappedSections,
    missingTimestamps: totalSections - mappedSections,
    titledSections: countTitledInstructionSections(groups),
  };
}

export function formatInstructionChapterCoverageSummary(
  coverage: InstructionChapterCoverage,
): string {
  if (coverage.totalSections === 0) return "0 sections";
  const titlePart =
    coverage.titledSections > 0
      ? `${coverage.titledSections} chapter title${coverage.titledSections === 1 ? "" : "s"} · `
      : "";
  if (coverage.mappedSections === coverage.totalSections) {
    return `${coverage.mappedSections}/${coverage.totalSections} timestamps mapped`;
  }
  return `${titlePart}${coverage.mappedSections}/${coverage.totalSections} timestamps mapped`;
}

export function validateInstructionChapters(input: {
  groups: InstructionGroupWithChapters[];
  videoDurationSeconds?: number;
}): InstructionChapterValidationIssue[] {
  const issues: InstructionChapterValidationIssue[] = [];
  const { groups, videoDurationSeconds } = input;

  const effectiveStarts: { index: number; start: number; source: InstructionChapterSource }[] = [];

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;

    if (group.startTimestamp != null) {
      if (!Number.isInteger(group.startTimestamp) || group.startTimestamp < 0) {
        issues.push({
          code: "invalid_start",
          message: `Section ${index + 1}: start timestamp must be a valid non-negative time.`,
          groupIndex: index,
          severity: "error",
        });
      } else if (videoDurationSeconds != null && group.startTimestamp > videoDurationSeconds) {
        issues.push({
          code: "start_beyond_duration",
          message: `Section ${index + 1}: start timestamp is beyond video duration.`,
          groupIndex: index,
          severity: "warning",
        });
      }
    }

    if (group.endTimestamp != null) {
      if (!Number.isInteger(group.endTimestamp) || group.endTimestamp < 0) {
        issues.push({
          code: "invalid_end",
          message: `Section ${index + 1}: end timestamp must be a valid non-negative time.`,
          groupIndex: index,
          severity: "error",
        });
      } else if (videoDurationSeconds != null && group.endTimestamp > videoDurationSeconds) {
        issues.push({
          code: "end_beyond_duration",
          message: `Section ${index + 1}: end timestamp is beyond video duration.`,
          groupIndex: index,
          severity: "warning",
        });
      }
      if (
        group.startTimestamp != null &&
        group.endTimestamp <= group.startTimestamp
      ) {
        issues.push({
          code: "end_before_start",
          message: `Section ${index + 1}: end must be after start.`,
          groupIndex: index,
          severity: "error",
        });
      }
    }

    const resolved = resolveInstructionChapter({
      group,
      groupIndex: index,
      allGroups: groups,
      videoDurationSeconds,
    });
    if (resolved.startTimestamp != null) {
      effectiveStarts.push({ index, start: resolved.startTimestamp, source: resolved.startSource });
    }
  }

  const startCounts = new Map<number, number>();
  for (const row of effectiveStarts) {
    startCounts.set(row.start, (startCounts.get(row.start) ?? 0) + 1);
  }
  for (const [time, count] of startCounts) {
    if (count > 1) {
      issues.push({
        code: "duplicate_start",
        message: `Duplicate chapter start at ${formatTimestampInput(time)}.`,
        severity: "warning",
      });
    }
  }

  for (let i = 1; i < effectiveStarts.length; i += 1) {
    const prev = effectiveStarts[i - 1]!;
    const current = effectiveStarts[i]!;
    if (current.start < prev.start) {
      issues.push({
        code: "non_monotonic",
        message: `Section ${current.index + 1}: timestamp occurs before the previous instruction section.`,
        groupIndex: current.index,
        severity: "warning",
      });
    }
  }

  return issues;
}

/** Derive compatibility stageAlignments from canonical InstructionGroup chapter data only. */
export function deriveStageAlignmentsFromCanonical(
  groups: InstructionGroupWithChapters[],
): RecipeStageAlignment[] {
  const rows: RecipeStageAlignment[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    if (!hasCanonicalStartTimestamp(group)) continue;
    const label = resolveChapterLabel(group);
    rows.push({
      instructionStageId: stageIdForIndex(index),
      instructionSectionTitle: String(group.name ?? "").trim() || label,
      videoStartSeconds: group.startTimestamp!,
      videoTimestampLabel: formatTimestampInput(group.startTimestamp!),
      chapterTitle: label,
      confidence: "VERIFIED",
      source: "manual",
    });
  }
  return rows;
}

/** Public chapter list from canonical instruction sections (mapped sections only). */
export function canonicalChaptersFromInstructions(
  groups: InstructionGroupWithChapters[],
  videoDurationSeconds?: number,
): RecipeYoutubeTimestamp[] {
  const chapters: RecipeYoutubeTimestamp[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const resolved = resolveInstructionChapter({
      group: groups[index]!,
      groupIndex: index,
      allGroups: groups,
      videoDurationSeconds,
    });
    if (resolved.startTimestamp == null) continue;
    chapters.push({
      time: resolved.startTimestamp,
      label: resolved.label,
    });
  }
  return chapters.sort((a, b) => a.time - b.time);
}

/**
 * Resolve public chapter timestamps with canonical precedence.
 * Does not mutate input; safe for read paths.
 */
export function resolvePublicChapterTimestamps(input: {
  instructions: InstructionGroupWithChapters[];
  stageAlignments?: RecipeStageAlignment[];
  legacyTimestamps?: RecipeYoutubeTimestamp[];
  videoDurationSeconds?: number;
}): RecipeYoutubeTimestamp[] {
  if (hasCanonicalInstructionChapters(input.instructions)) {
    return canonicalChaptersFromInstructions(
      input.instructions,
      input.videoDurationSeconds,
    );
  }
  if (input.stageAlignments?.length) {
    const fromAlignments = mesaCanonicalChaptersFromStageAlignmentsCompat(input.stageAlignments);
    if (fromAlignments.length) return fromAlignments;
  }
  return [...(input.legacyTimestamps ?? [])]
    .filter((row) => row.label.trim() && row.time >= 0)
    .sort((a, b) => a.time - b.time);
}

function mesaCanonicalChaptersFromStageAlignmentsCompat(
  alignments: RecipeStageAlignment[],
): RecipeYoutubeTimestamp[] {
  const confident = alignments
    .filter(
      (row) =>
        row.videoStartSeconds >= 0 &&
        Boolean(row.chapterTitle.trim() || row.instructionSectionTitle.trim()),
    )
    .slice()
    .sort((a, b) => a.videoStartSeconds - b.videoStartSeconds);
  const byTime = new Map<number, RecipeYoutubeTimestamp>();
  for (const row of confident) {
    if (byTime.has(row.videoStartSeconds)) continue;
    byTime.set(row.videoStartSeconds, {
      time: row.videoStartSeconds,
      label: row.chapterTitle.trim() || row.instructionSectionTitle.trim(),
    });
  }
  return [...byTime.values()];
}

/** Apply derived compatibility data on save when canonical chapters exist. */
export function enrichRecipeValuesWithDerivedChapters(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const groups = normalizeInstructionGroups(values.instructions);
  const blob =
    values.youtube && typeof values.youtube === "object"
      ? ({ ...(values.youtube as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  if (groups.length === 0) {
    if (Array.isArray(blob.stageAlignments) && blob.stageAlignments.length > 0) {
      return {
        ...values,
        instructions: groups,
        youtube: { ...blob, stageAlignments: [] },
      };
    }
    return { ...values, instructions: groups };
  }

  if (!hasCanonicalInstructionChapters(groups)) {
    return values;
  }

  const alignments = deriveStageAlignmentsFromCanonical(groups);
  blob.stageAlignments = alignments;
  const canonicalTimestamps = canonicalChaptersFromInstructions(
    groups,
    parseVideoDurationSeconds(blob.duration ?? values.youtubeUrl),
  );
  if (canonicalTimestamps.length) {
    blob.timestamps = canonicalTimestamps;
  }

  return {
    ...values,
    instructions: groups,
    youtube: blob,
  };
}

function parseVideoDurationSeconds(duration: unknown): number | undefined {
  if (typeof duration === "number" && duration > 0) return Math.floor(duration);
  if (typeof duration === "string" && duration.trim()) {
    const parsed = parseTimestampInput(duration);
    return parsed ?? undefined;
  }
  return undefined;
}

/** Future YouTube description chapter publishing checks — not Mesa blockers. */
export function evaluateYoutubeChapterReadiness(chapters: RecipeYoutubeTimestamp[]): {
  ready: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const sorted = [...chapters].sort((a, b) => a.time - b.time);
  if (sorted.length < 3) {
    issues.push("YouTube requires at least 3 chapters.");
  }
  if (sorted.length && sorted[0]!.time !== 0) {
    issues.push("YouTube chapters should begin at 0:00.");
  }
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.time <= sorted[i - 1]!.time) {
      issues.push("YouTube chapters must be strictly ascending.");
      break;
    }
    if (sorted[i]!.time - sorted[i - 1]!.time < 10) {
      issues.push("YouTube chapters should be at least 10 seconds apart.");
      break;
    }
  }
  return { ready: issues.length === 0, issues };
}

export function duplicateInstructionGroupForCopy(
  group: InstructionGroupWithChapters,
): InstructionGroupWithChapters {
  return {
    name: group.name,
    steps: [...group.steps],
    chapterLabel: group.chapterLabel,
    // Clear timestamps on duplicate — two sections must not share the same video range.
    startTimestamp: undefined,
    endTimestamp: undefined,
  };
}

export { formatTimestampInput, parseTimestampInput };
