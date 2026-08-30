import type { RecipeYoutubeTimestamp } from "@/data/youtube-types";
import type { AiConfidence, AiFieldAnnotation, RecipeAiMeta } from "@/lib/ai-recipe/types";
import { isAiConfidence, tallyConfidence } from "@/lib/ai-recipe/types";
import { formatTimestampInput, parseTimestampInput } from "@/lib/youtube-metadata-editor";

export type AiYoutubeChapterInput = {
  time?: unknown;
  label?: unknown;
  confidence?: unknown;
  sourceNote?: unknown;
};

export type NormalizedAiYoutubeChapter = {
  time: number;
  label: string;
  confidence: AiConfidence;
  sourceNote: string;
};

function readChapter(row: AiYoutubeChapterInput): NormalizedAiYoutubeChapter | null {
  const label = String(row.label ?? "").trim();
  const timeRaw = String(row.time ?? "").trim();
  if (!label || !timeRaw) return null;
  const time = parseTimestampInput(timeRaw);
  if (time == null) return null;
  const confidence =
    typeof row.confidence === "string" &&
    ["VERIFIED", "HIGH_CONFIDENCE_INFERENCE", "ESTIMATED", "UNKNOWN"].includes(row.confidence)
      ? (row.confidence as AiConfidence)
      : "HIGH_CONFIDENCE_INFERENCE";
  return {
    time,
    label,
    confidence,
    sourceNote: String(row.sourceNote ?? "").trim(),
  };
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Merge adjacent chapters with near-identical labels or duplicate times. */
function consolidateAdjacentChapters(chapters: NormalizedAiYoutubeChapter[]): NormalizedAiYoutubeChapter[] {
  if (chapters.length <= 1) return chapters;
  const merged: NormalizedAiYoutubeChapter[] = [];
  for (const chapter of chapters) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(chapter);
      continue;
    }
    const sameTime = prev.time === chapter.time;
    const similarLabel = normalizeLabel(prev.label) === normalizeLabel(chapter.label);
    if (sameTime || similarLabel) {
      if (chapter.confidence === "VERIFIED" && prev.confidence !== "VERIFIED") {
        merged[merged.length - 1] = chapter;
      }
      continue;
    }
    merged.push(chapter);
  }
  return merged;
}

export function normalizeAiYoutubeChapters(
  raw: unknown,
  videoDurationSeconds?: number | null,
): NormalizedAiYoutubeChapter[] {
  if (!Array.isArray(raw)) return [];
  const parsed = raw
    .map((row) => readChapter((row || {}) as AiYoutubeChapterInput))
    .filter((row): row is NormalizedAiYoutubeChapter => row != null);

  const byTime = new Map<number, NormalizedAiYoutubeChapter>();
  for (const chapter of parsed) {
    const existing = byTime.get(chapter.time);
    if (!existing || chapter.confidence === "VERIFIED") {
      byTime.set(chapter.time, chapter);
    }
  }

  let chapters = [...byTime.values()].sort((a, b) => a.time - b.time);
  chapters = consolidateAdjacentChapters(chapters);

  if (videoDurationSeconds != null && Number.isFinite(videoDurationSeconds) && videoDurationSeconds > 0) {
    chapters = chapters.filter((chapter) => chapter.time <= videoDurationSeconds);
  }

  return chapters;
}

export function aiChaptersToTimestamps(chapters: NormalizedAiYoutubeChapter[]): RecipeYoutubeTimestamp[] {
  return chapters.map((chapter) => ({
    label: chapter.label,
    time: chapter.time,
  }));
}

function readConfidentString(
  raw: unknown,
  fallbackConfidence: AiConfidence = "UNKNOWN",
): { value: string; confidence: AiConfidence; sourceNote: string } | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string") {
    return { value: raw.trim(), confidence: fallbackConfidence, sourceNote: "" };
  }
  if (typeof raw === "object" && !Array.isArray(raw) && "value" in (raw as object)) {
    const row = raw as { value?: unknown; confidence?: unknown; sourceNote?: unknown };
    const confidence = isAiConfidence(row.confidence) ? row.confidence : fallbackConfidence;
    return {
      value: String(row.value ?? "").trim(),
      confidence,
      sourceNote: String(row.sourceNote ?? "").trim(),
    };
  }
  return null;
}

export function buildYoutubeBlobFromAi(input: {
  raw: unknown;
  confidenceByPath: Record<string, AiFieldAnnotation>;
  summary: RecipeAiMeta["summary"];
}): Record<string, unknown> | null {
  if (!input.raw || typeof input.raw !== "object" || Array.isArray(input.raw)) return null;
  const root = input.raw as Record<string, unknown>;

  const durationC = readConfidentString(root.duration, "VERIFIED");
  const hookC = readConfidentString(root.hook, "HIGH_CONFIDENCE_INFERENCE");
  const chaptersRaw = root.chapters ?? root.timestamps;

  const duration = durationC?.value ? normalizeAiVideoDuration(durationC.value) : "";
  const durationSeconds = duration ? parseTimestampInput(duration) : null;

  const chapters = normalizeAiYoutubeChapters(chaptersRaw, durationSeconds);
  const hook = hookC?.value ?? "";

  if (durationC?.value) {
    input.confidenceByPath["values.youtube.duration"] = {
      confidence: durationC.confidence,
      sourceNote: durationC.sourceNote,
    };
    tallyConfidence(durationC.confidence, input.summary);
  }

  if (hookC?.value) {
    input.confidenceByPath["values.youtube.hook"] = {
      confidence: hookC.confidence,
      sourceNote: hookC.sourceNote,
    };
    tallyConfidence(hookC.confidence, input.summary);
  }

  if (chapters.length) {
    input.confidenceByPath["values.youtube.timestamps"] = {
      confidence: chapters.some((c) => c.confidence === "VERIFIED")
        ? "VERIFIED"
        : "HIGH_CONFIDENCE_INFERENCE",
      sourceNote: `${chapters.length} consolidated chapters from video timeline`,
    };
    tallyConfidence(
      chapters.some((c) => c.confidence === "VERIFIED") ? "VERIFIED" : "HIGH_CONFIDENCE_INFERENCE",
      input.summary,
    );
    chapters.forEach((chapter, index) => {
      input.confidenceByPath[`values.youtube.timestamps.${index}`] = {
        confidence: chapter.confidence,
        sourceNote: chapter.sourceNote,
      };
      tallyConfidence(chapter.confidence, input.summary);
    });
  }

  const blob: Record<string, unknown> = {};
  if (duration) blob.duration = duration;
  if (hook) blob.hook = hook;
  if (chapters.length) blob.timestamps = aiChaptersToTimestamps(chapters);
  return Object.keys(blob).length ? blob : null;
}

export function normalizeAiVideoDuration(raw: unknown): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const asSeconds = parseTimestampInput(trimmed);
  if (asSeconds != null) return formatTimestampInput(asSeconds);
  return trimmed;
}
