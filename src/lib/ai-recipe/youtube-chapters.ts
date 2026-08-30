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

const CHAPTER_LABEL_ALIGN_SECONDS = 8;
const CHAPTER_MIN_GAP_SECONDS = 22;
const CHAPTER_TARGET_MIN = 5;
const CHAPTER_TARGET_MAX = 9;

const PROMOTIONAL_LABEL_PATTERN =
  /\b(secret|perfect|transform(?:ing)?|amazing|ultimate|incredible|discover|reveal|must[- ]try)\b/i;

const PROCEDURAL_LABEL_PATTERN =
  /\b(mix|knead|proof|rise|rest|divide|shape|portion|roll|flatten|cook|bake|fry|grill|simmer|boil|serve|garnish|butter|prepare|intro|overview|finish)\b/i;

function isTrustworthyAiChapter(chapter: NormalizedAiYoutubeChapter): boolean {
  return chapter.confidence === "VERIFIED" || chapter.confidence === "HIGH_CONFIDENCE_INFERENCE";
}

function isPromotionalLabel(label: string): boolean {
  return PROMOTIONAL_LABEL_PATTERN.test(label);
}

function isProceduralLabel(label: string): boolean {
  return PROCEDURAL_LABEL_PATTERN.test(label);
}

function labelQualityScore(label: string): number {
  let score = 0;
  if (isProceduralLabel(label)) score += 3;
  if (isPromotionalLabel(label)) score -= 4;
  if (label.length <= 42) score += 1;
  if (label.length > 64) score -= 1;
  return score;
}

function chooseMergedLabel(
  primary: NormalizedAiYoutubeChapter,
  secondary: NormalizedAiYoutubeChapter,
): string {
  const primaryScore = labelQualityScore(primary.label);
  const secondaryScore = labelQualityScore(secondary.label);
  if (secondaryScore > primaryScore) return secondary.label.trim();
  if (primaryScore > secondaryScore) return primary.label.trim();
  if (primary.confidence === "VERIFIED" && secondary.confidence !== "VERIFIED") {
    return primary.label.trim();
  }
  return secondary.label.trim() || primary.label.trim();
}

export function chaptersFromBlobTimestamps(
  timestamps: unknown,
  durationSeconds?: number | null,
): NormalizedAiYoutubeChapter[] {
  if (!Array.isArray(timestamps)) return [];
  return normalizeAiYoutubeChapters(
    timestamps.map((item) => {
      const row = item as { time?: unknown; label?: unknown };
      return {
        time: row.time,
        label: row.label,
        confidence: "HIGH_CONFIDENCE_INFERENCE",
        sourceNote: "From recipe video analysis",
      };
    }),
    durationSeconds,
  );
}

function nearestChapterIndex(chapters: NormalizedAiYoutubeChapter[], time: number): number | null {
  if (!chapters.length) return null;
  let bestIndex = 0;
  let bestDistance = Math.abs(chapters[0].time - time);
  for (let index = 1; index < chapters.length; index += 1) {
    const distance = Math.abs(chapters[index].time - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestDistance <= CHAPTER_LABEL_ALIGN_SECONDS ? bestIndex : null;
}

function minGapToChapters(chapters: NormalizedAiYoutubeChapter[], time: number): number {
  if (!chapters.length) return Number.POSITIVE_INFINITY;
  return Math.min(...chapters.map((chapter) => Math.abs(chapter.time - time)));
}

function trimToTargetMax(chapters: NormalizedAiYoutubeChapter[]): NormalizedAiYoutubeChapter[] {
  let trimmed = [...chapters];
  while (trimmed.length > CHAPTER_TARGET_MAX) {
    let mergeIndex = 0;
    let smallestGap = Number.POSITIVE_INFINITY;
    for (let index = 0; index < trimmed.length - 1; index += 1) {
      const gap = trimmed[index + 1].time - trimmed[index].time;
      if (gap < smallestGap) {
        smallestGap = gap;
        mergeIndex = index;
      }
    }
    const left = trimmed[mergeIndex];
    const right = trimmed[mergeIndex + 1];
    const merged: NormalizedAiYoutubeChapter = {
      time: left.time,
      label: chooseMergedLabel(left, right),
      confidence:
        left.confidence === "VERIFIED" || right.confidence === "VERIFIED"
          ? "VERIFIED"
          : "HIGH_CONFIDENCE_INFERENCE",
      sourceNote:
        left.confidence === "VERIFIED"
          ? left.sourceNote
          : right.confidence === "VERIFIED"
            ? right.sourceNote
            : "Consolidated adjacent cooking stages",
    };
    trimmed = [...trimmed.slice(0, mergeIndex), merged, ...trimmed.slice(mergeIndex + 2)];
  }
  return trimmed;
}

/**
 * Merge YouTube description chapters with grounded Gemini/analysis chapters.
 * Description times stay VERIFIED; sparse or promotional description sets gain useful stages.
 */
export function mergeRecipeYoutubeChapters(input: {
  descriptionChapters: NormalizedAiYoutubeChapter[];
  aiChapters: NormalizedAiYoutubeChapter[];
  durationSeconds?: number | null;
}): NormalizedAiYoutubeChapter[] {
  const durationSeconds =
    input.durationSeconds != null && input.durationSeconds > 0 ? input.durationSeconds : null;

  const description = normalizeAiYoutubeChapters(input.descriptionChapters, durationSeconds);
  const ai = normalizeAiYoutubeChapters(
    input.aiChapters.filter(isTrustworthyAiChapter),
    durationSeconds,
  );

  if (!description.length && !ai.length) return [];
  if (!description.length) {
    return trimToTargetMax(ai).slice(0, CHAPTER_TARGET_MAX);
  }
  if (!ai.length) {
    return description;
  }

  const merged: NormalizedAiYoutubeChapter[] = description.map((chapter) => ({ ...chapter }));
  const matchedAi = new Set<number>();

  for (let index = 0; index < ai.length; index += 1) {
    const aiChapter = ai[index];
    const matchIndex = nearestChapterIndex(merged, aiChapter.time);
    if (matchIndex == null) continue;
    matchedAi.add(index);
    const descriptionChapter = merged[matchIndex];
    merged[matchIndex] = {
      time: descriptionChapter.time,
      label: chooseMergedLabel(descriptionChapter, aiChapter),
      confidence: "VERIFIED",
      sourceNote: descriptionChapter.sourceNote || "From YouTube video description",
    };
  }

  const minGap =
    merged.length < CHAPTER_TARGET_MIN
      ? Math.max(12, CHAPTER_MIN_GAP_SECONDS - 8)
      : CHAPTER_MIN_GAP_SECONDS;

  for (let index = 0; index < ai.length; index += 1) {
    if (matchedAi.has(index)) continue;
    const aiChapter = ai[index];
    if (minGapToChapters(merged, aiChapter.time) < minGap) continue;
    merged.push({ ...aiChapter });
  }

  merged.sort((a, b) => a.time - b.time);

  let normalized = normalizeAiYoutubeChapters(merged, durationSeconds);
  if (normalized.length > CHAPTER_TARGET_MAX) {
    normalized = trimToTargetMax(normalized);
  }

  return normalized;
}

export function applyMergedChapterConfidence(input: {
  chapters: NormalizedAiYoutubeChapter[];
  confidenceByPath: Record<string, AiFieldAnnotation>;
  summary: RecipeAiMeta["summary"];
}) {
  if (!input.chapters.length) return;

  input.confidenceByPath["values.youtube.timestamps"] = {
    confidence: input.chapters.some((chapter) => chapter.confidence === "VERIFIED")
      ? "VERIFIED"
      : "HIGH_CONFIDENCE_INFERENCE",
    sourceNote: `${input.chapters.length} merged recipe chapters`,
  };
  tallyConfidence(input.confidenceByPath["values.youtube.timestamps"].confidence, input.summary);

  input.chapters.forEach((chapter, index) => {
    input.confidenceByPath[`values.youtube.timestamps.${index}`] = {
      confidence: chapter.confidence,
      sourceNote: chapter.sourceNote,
    };
    tallyConfidence(chapter.confidence, input.summary);
  });
}

export function aiChaptersFromGeminiRaw(raw: unknown): NormalizedAiYoutubeChapter[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const root = raw as Record<string, unknown>;
  const metadata = root.youtubeMetadata ?? root.youtube;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const row = metadata as Record<string, unknown>;
  return normalizeAiYoutubeChapters(row.chapters ?? row.timestamps, null);
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
