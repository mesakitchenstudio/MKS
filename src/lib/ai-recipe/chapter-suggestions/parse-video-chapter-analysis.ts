import type { AiConfidence } from "@/lib/ai-recipe/types";
import {
  normalizeAiYoutubeChapters,
  type NormalizedAiYoutubeChapter,
} from "@/lib/ai-recipe/youtube-chapters";
import { parseTimestampInput } from "@/lib/youtube-metadata-editor";

export type VideoChapterAnalysisStage =
  | "VIDEO_ANALYSIS_REQUEST_FAILED"
  | "VIDEO_ANALYSIS_TIMEOUT"
  | "VIDEO_ANALYSIS_EMPTY"
  | "VIDEO_ANALYSIS_PARSE_FAILED"
  | "VIDEO_ANALYSIS_NO_SECTION_MATCH"
  | "VIDEO_ANALYSIS_INVALID_TIMESTAMPS"
  | "VIDEO_ANALYSIS_CACHE_INVALID"
  | "VIDEO_ANALYSIS_UNCONFIGURED"
  | "VIDEO_ANALYSIS_OK";

export type VideoSectionTarget = {
  sectionIndex: number;
  title: string;
  steps: string[];
};

/** Gemini hit mapped to a recipe instruction section. */
export type VideoChapterSectionHit = {
  sectionIndex: number;
  matched: boolean;
  startTimestamp?: number;
  label?: string;
  confidence: AiConfidence;
  evidence?: string;
};

export type ParsedVideoChapterAnalysis = {
  duration?: string;
  chapters: NormalizedAiYoutubeChapter[];
  sectionHits: VideoChapterSectionHit[];
  rawChapterCount: number;
  parseNotes: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function coerceTimeSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    return parseTimestampInput(value);
  }
  return null;
}

function coerceConfidence(value: unknown): AiConfidence {
  if (
    typeof value === "string" &&
    ["VERIFIED", "HIGH_CONFIDENCE_INFERENCE", "ESTIMATED", "UNKNOWN"].includes(value)
  ) {
    return value as AiConfidence;
  }
  return "HIGH_CONFIDENCE_INFERENCE";
}

function extractChapterArrays(raw: unknown): { arrays: unknown[]; notes: string[] } {
  const notes: string[] = [];
  const arrays: unknown[] = [];
  const root = asRecord(raw);
  if (!root) return { arrays, notes: ["root_not_object"] };

  const candidates: Array<{ key: string; value: unknown }> = [
    { key: "chapters", value: root.chapters },
    { key: "sections", value: root.sections },
    { key: "targets", value: root.targets },
    { key: "sectionHits", value: root.sectionHits },
  ];

  const metadata = asRecord(root.youtubeMetadata) ?? asRecord(root.youtube);
  if (metadata) {
    candidates.push(
      { key: "youtubeMetadata.chapters", value: metadata.chapters },
      { key: "youtubeMetadata.timestamps", value: metadata.timestamps },
      { key: "youtubeMetadata.sections", value: metadata.sections },
    );
  }

  for (const candidate of candidates) {
    if (Array.isArray(candidate.value) && candidate.value.length) {
      arrays.push(candidate.value);
      notes.push(`found:${candidate.key}:${candidate.value.length}`);
    }
  }

  return { arrays, notes };
}

function readSectionHit(
  row: Record<string, unknown>,
  fallbackIndex?: number,
): VideoChapterSectionHit | null {
  const matchedRaw = row.matched;
  const matched =
    matchedRaw === true ||
    matchedRaw === "true" ||
    (matchedRaw == null &&
      (row.startTime != null ||
        row.startTimestamp != null ||
        row.time != null ||
        row.timestamp != null));

  const sectionIndexRaw = row.sectionIndex ?? row.index ?? row.targetIndex ?? fallbackIndex;
  const sectionIndex =
    typeof sectionIndexRaw === "number"
      ? sectionIndexRaw
      : typeof sectionIndexRaw === "string" && /^\d+$/.test(sectionIndexRaw.trim())
        ? Number(sectionIndexRaw.trim())
        : null;
  if (sectionIndex == null || sectionIndex < 0) return null;

  if (!matched) {
    return {
      sectionIndex,
      matched: false,
      confidence: coerceConfidence(row.confidence),
      evidence: String(row.evidence ?? row.sourceNote ?? row.reason ?? "").trim() || undefined,
      label: String(row.label ?? row.suggestedTitle ?? "").trim() || undefined,
    };
  }

  const startTimestamp = coerceTimeSeconds(
    row.startTime ?? row.startTimestamp ?? row.time ?? row.timestamp,
  );
  if (startTimestamp == null) {
    return {
      sectionIndex,
      matched: false,
      confidence: coerceConfidence(row.confidence),
      evidence: "Matched without a parseable timestamp",
      label: String(row.label ?? row.suggestedTitle ?? "").trim() || undefined,
    };
  }

  return {
    sectionIndex,
    matched: true,
    startTimestamp,
    label: String(row.label ?? row.suggestedTitle ?? "").trim() || undefined,
    confidence: coerceConfidence(row.confidence),
    evidence: String(row.evidence ?? row.sourceNote ?? "").trim() || undefined,
  };
}

function chapterFromLooseRow(row: Record<string, unknown>): NormalizedAiYoutubeChapter | null {
  const label = String(row.label ?? row.title ?? row.name ?? "").trim();
  const time = coerceTimeSeconds(row.time ?? row.startTime ?? row.startTimestamp ?? row.timestamp);
  if (!label || time == null) return null;
  return {
    time,
    label,
    confidence: coerceConfidence(row.confidence),
    sourceNote: String(row.sourceNote ?? row.evidence ?? "").trim(),
  };
}

/**
 * Parse Gemini video-chapter JSON from several observed shapes.
 * Prefer section-targeted hits; also collect generic chapters for fallback matching.
 */
export function parseVideoChapterAnalysisRaw(raw: unknown): ParsedVideoChapterAnalysis {
  const parseNotes: string[] = [];
  const sectionHits: VideoChapterSectionHit[] = [];
  const looseChapters: NormalizedAiYoutubeChapter[] = [];

  const root = asRecord(raw);
  const duration =
    typeof root?.duration === "string"
      ? root.duration
      : typeof asRecord(root?.youtubeMetadata)?.duration === "string"
        ? String(asRecord(root?.youtubeMetadata)!.duration)
        : undefined;

  const { arrays, notes } = extractChapterArrays(raw);
  parseNotes.push(...notes);

  for (const array of arrays) {
    if (!Array.isArray(array)) continue;
    array.forEach((item, index) => {
      const row = asRecord(item);
      if (!row) return;

      const hit = readSectionHit(row, index);
      if (hit) {
        const existing = sectionHits.find((rowHit) => rowHit.sectionIndex === hit.sectionIndex);
        if (!existing || (hit.matched && !existing.matched)) {
          if (existing) {
            const replaceAt = sectionHits.indexOf(existing);
            sectionHits[replaceAt] = hit;
          } else {
            sectionHits.push(hit);
          }
        }
      }

      const chapter = chapterFromLooseRow(row);
      if (chapter) looseChapters.push(chapter);
    });
  }

  const chapters = normalizeAiYoutubeChapters(
    looseChapters.map((chapter) => ({
      time: String(chapter.time),
      label: chapter.label,
      confidence: chapter.confidence,
      sourceNote: chapter.sourceNote,
    })),
    null,
  );

  const matchedHits = sectionHits.filter((hit) => hit.matched && hit.startTimestamp != null);
  parseNotes.push(`matchedHits:${matchedHits.length}`);
  parseNotes.push(`genericChapters:${chapters.length}`);

  return {
    duration,
    chapters,
    sectionHits: sectionHits.sort((a, b) => a.sectionIndex - b.sectionIndex),
    rawChapterCount: Math.max(chapters.length, sectionHits.length),
    parseNotes,
  };
}

export function hitsToNormalizedChapters(
  hits: VideoChapterSectionHit[],
): NormalizedAiYoutubeChapter[] {
  return hits
    .filter((hit) => hit.matched && hit.startTimestamp != null)
    .map((hit) => ({
      time: hit.startTimestamp!,
      label: hit.label?.trim() || `Section ${hit.sectionIndex + 1}`,
      confidence: hit.confidence,
      sourceNote: hit.evidence?.trim() || "",
    }));
}
