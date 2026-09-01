import {
  hasCanonicalStartTimestamp,
  normalizeInstructionGroups,
  resolveChapterLabel,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";
import { formatTimestampInput } from "@/lib/youtube-metadata-editor";
import type {
  YoutubeChapterExport,
  YoutubeChapterExportItem,
  YoutubeChapterReadinessIssue,
} from "@/lib/youtube-chapter-sync/types";

export const DEFAULT_SYNTHETIC_INTRO_LABEL = "Introduction";

export function formatYoutubeChapterExportLine(timestamp: number, label: string): string {
  return `${formatTimestampInput(timestamp)} ${label.trim()}`;
}

export function formatYoutubeChapterBlock(items: YoutubeChapterExportItem[]): string {
  return [...items]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((item) => formatYoutubeChapterExportLine(item.timestamp, item.label))
    .join("\n");
}

function inferIntroLabelFromDescription(
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

/**
 * Build YouTube export from canonical InstructionGroup chapters only.
 * Does not use stageAlignments or legacy timestamps when canonical mode is active.
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

  mapped.sort((a, b) => a.timestamp - b.timestamp);

  const items: YoutubeChapterExportItem[] = [];
  if (mapped.length > 0 && mapped[0]!.timestamp > 0) {
    const intro =
      input.introLabel?.trim() ||
      (input.remoteDescription
        ? inferIntroLabelFromDescription(input.remoteDescription)
        : DEFAULT_SYNTHETIC_INTRO_LABEL);
    items.push({
      timestamp: 0,
      label: intro,
      source: "synthetic_intro",
    });
  }
  items.push(...mapped);

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
  const sorted = [...input.items].sort((a, b) => a.timestamp - b.timestamp);

  if (sorted.length < 3) {
    errors.push({
      code: "min_chapters",
      message: "YouTube requires at least 3 chapters.",
      severity: "error",
    });
  }

  if (sorted.length && sorted[0]!.timestamp !== 0) {
    errors.push({
      code: "first_not_zero",
      message: "YouTube chapters must begin at 00:00.",
      severity: "error",
    });
  }

  for (const item of sorted) {
    if (!item.label.trim()) {
      errors.push({
        code: "empty_label",
        message: "Each YouTube chapter needs a non-empty label.",
        severity: "error",
      });
      break;
    }
  }

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const current = sorted[i]!;
    if (current.timestamp <= prev.timestamp) {
      errors.push({
        code: "non_ascending",
        message: "YouTube chapters must be strictly ascending.",
        severity: "error",
      });
      break;
    }
    if (current.timestamp - prev.timestamp < 10) {
      const duration = current.timestamp - prev.timestamp;
      errors.push({
        code: "min_gap",
        message: `YouTube chapters cannot be published yet. The chapter starting at ${formatTimestampInput(prev.timestamp)} would be only ${duration} seconds long.`,
        severity: "error",
      });
      break;
    }
  }

  const duration = input.videoDurationSeconds;
  if (duration != null && duration > 0 && sorted.length > 0) {
    const last = sorted[sorted.length - 1]!;
    if (last.timestamp > duration) {
      errors.push({
        code: "beyond_duration",
        message: "A chapter timestamp is beyond the known video duration.",
        severity: "error",
      });
    }
    const finalChapterLength = duration - last.timestamp;
    if (finalChapterLength < 10) {
      errors.push({
        code: "final_too_short",
        message: `The final chapter would be only ${finalChapterLength} seconds long (YouTube requires at least 10 seconds).`,
        severity: "error",
      });
    }
  }

  const seen = new Set<number>();
  for (const item of sorted) {
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
