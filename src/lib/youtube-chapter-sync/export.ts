import {
  hasCanonicalStartTimestamp,
  normalizeInstructionGroups,
  resolveChapterLabel,
} from "@/lib/instruction-chapters";
import { formatTimestampInput } from "@/lib/youtube-metadata-editor";
import type {
  YoutubeChapterExport,
  YoutubeChapterExportItem,
  YoutubeChapterReadinessIssue,
} from "@/lib/youtube-chapter-sync/types";
import {
  finalChapterDurationSeconds,
  isFinalChapterLongEnough,
  YOUTUBE_CHAPTER_MIN_SECONDS,
  YOUTUBE_FIRST_CHAPTER_MUST_START_AT_ZERO_MESSAGE,
  youtubeChapterGapIssue,
} from "@/lib/youtube-chapter-sync/validity";

export const DEFAULT_SYNTHETIC_INTRO_LABEL = "Introduction";

/** @deprecated Synthetic intro is no longer auto-injected — staff must map 00:00 explicitly. */
export function inferIntroLabelFromDescription(
  description: string,
  fallback = DEFAULT_SYNTHETIC_INTRO_LABEL,
): string {
  for (const line of description.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^0:00\s+(.+)$/i) ?? trimmed.match(/^00:00\s+(.+)$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return fallback;
}

export function formatYoutubeChapterExportLine(timestamp: number, label: string): string {
  return `${formatTimestampInput(timestamp)} ${label.trim()}`;
}

/** Format export items in canonical instruction export order (never timestamp-sorted). */
export function formatYoutubeChapterBlock(items: YoutubeChapterExportItem[]): string {
  return items
    .map((item) => formatYoutubeChapterExportLine(item.timestamp, item.label))
    .join("\n");
}

/**
 * Build YouTube export from canonical InstructionGroup chapters only.
 * Preserves instruction array order — never sorts by timestamp.
 */
export function buildYoutubeChapterExport(input: {
  videoId: string;
  instructions: unknown;
  videoDurationSeconds?: number;
  introLabel?: string;
  remoteDescription?: string;
}): YoutubeChapterExport {
  const groups = normalizeInstructionGroups(input.instructions);
  const mapped: YoutubeChapterExportItem[] = [];

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    if (!hasCanonicalStartTimestamp(group)) continue;
    const label = resolveChapterLabel(group);
    if (!label.trim()) continue;
    mapped.push({
      timestamp: group.startTimestamp!,
      label: label.trim(),
      source: "mesa_section",
      instructionIndex: index,
    });
  }

  const items: YoutubeChapterExportItem[] = [...mapped];

  const readiness = evaluateYoutubeExportReadiness({
    items,
    videoDurationSeconds: input.videoDurationSeconds,
  });

  return {
    videoId: input.videoId,
    items,
    ready: readiness.ready,
    errors: readiness.errors,
    warnings: readiness.warnings,
  };
}

function evaluateCanonicalInstructionOrder(
  items: YoutubeChapterExportItem[],
): YoutubeChapterReadinessIssue | null {
  const mesa = items.filter((item) => item.source === "mesa_section");
  for (let i = 1; i < mesa.length; i += 1) {
    const prev = mesa[i - 1]!;
    const current = mesa[i]!;
    if (current.timestamp <= prev.timestamp) {
      return {
        code: "non_monotonic_canonical",
        message: `Timestamp for "${current.label}" occurs before the previous instruction section.`,
        severity: "error",
      };
    }
  }
  return null;
}

export function evaluateYoutubeExportReadiness(input: {
  items: YoutubeChapterExportItem[];
  videoDurationSeconds?: number;
}): {
  ready: boolean;
  errors: YoutubeChapterReadinessIssue[];
  warnings: YoutubeChapterReadinessIssue[];
} {
  const errors: YoutubeChapterReadinessIssue[] = [];
  const warnings: YoutubeChapterReadinessIssue[] = [];
  const items = input.items;

  const canonicalOrderIssue = evaluateCanonicalInstructionOrder(items);
  if (canonicalOrderIssue) {
    errors.push(canonicalOrderIssue);
  }

  if (items.length < 3) {
    errors.push({
      code: "min_chapters",
      message: "YouTube requires at least 3 chapters.",
      severity: "error",
    });
  }

  if (items.length && items[0]!.timestamp !== 0) {
    errors.push({
      code: "first_not_zero",
      message: YOUTUBE_FIRST_CHAPTER_MUST_START_AT_ZERO_MESSAGE,
      severity: "error",
    });
  }

  for (const item of items) {
    if (!item.label.trim()) {
      errors.push({
        code: "empty_label",
        message: "Each YouTube chapter needs a non-empty label.",
        severity: "error",
      });
      break;
    }
  }

  for (let i = 1; i < items.length; i += 1) {
    const prev = items[i - 1]!;
    const current = items[i]!;
    if (current.timestamp <= prev.timestamp) {
      errors.push({
        code: "non_ascending",
        message: "YouTube chapters must be strictly ascending.",
        severity: "error",
      });
      break;
    }
    const gapIssue = youtubeChapterGapIssue({
      previousTimestamp: prev.timestamp,
      currentTimestamp: current.timestamp,
    });
    if (gapIssue?.hardInvalid) {
      const duration = current.timestamp - prev.timestamp;
      errors.push({
        code: "min_gap",
        message: `YouTube chapters cannot be published yet. The chapter starting at ${formatTimestampInput(prev.timestamp)} would be only ${duration} seconds long (minimum ${YOUTUBE_CHAPTER_MIN_SECONDS} seconds).`,
        severity: "error",
      });
      break;
    }
    if (gapIssue?.editorialWarning) {
      warnings.push({
        code: "short_gap",
        message: gapIssue.editorialWarning,
        severity: "warning",
      });
    }
  }

  const duration = input.videoDurationSeconds;
  if (duration != null && duration > 0 && items.length > 0) {
    const last = items[items.length - 1]!;
    if (last.timestamp > duration) {
      errors.push({
        code: "beyond_duration",
        message: "A chapter timestamp is beyond the known video duration.",
        severity: "error",
      });
    }
    const finalChapterLength = finalChapterDurationSeconds(last.timestamp, duration);
    if (!isFinalChapterLongEnough(last.timestamp, duration)) {
      errors.push({
        code: "final_too_short",
        message: `The final chapter would be only ${finalChapterLength} seconds long (YouTube requires at least ${YOUTUBE_CHAPTER_MIN_SECONDS} seconds).`,
        severity: "error",
      });
    }
  }

  const seen = new Set<number>();
  for (const item of items) {
    if (seen.has(item.timestamp)) {
      errors.push({
        code: "duplicate",
        message: `Duplicate chapter timestamp at ${formatTimestampInput(item.timestamp)}.`,
        severity: "error",
      });
      break;
    }
    seen.add(item.timestamp);
  }

  return { ready: errors.length === 0, errors, warnings };
}

export function mappedCanonicalSectionCount(instructions: unknown): number {
  const groups = normalizeInstructionGroups(instructions);
  return groups.filter(hasCanonicalStartTimestamp).length;
}
