import type { AiConfidence } from "@/lib/ai-recipe/types";
import type {
  RecipeStageAlignment,
  RecipeYoutubeTimestamp,
  StageAlignmentSource,
} from "@/data/youtube-types";
import { parseTimestampInput } from "@/lib/youtube-metadata-editor";

export type { RecipeStageAlignment, StageAlignmentSource };

const CONFIDENT: AiConfidence[] = ["VERIFIED", "HIGH_CONFIDENCE_INFERENCE"];

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function isConfidentStageAlignment(row: RecipeStageAlignment) {
  return CONFIDENT.includes(row.confidence) && row.videoStartSeconds >= 0 && Boolean(row.chapterTitle.trim());
}

/**
 * Build Mesa canonical chapter timestamps from instruction-stage alignments.
 * Instruction groups define order/count; low-confidence rows are omitted (no fake 0:00).
 */
export function mesaCanonicalChaptersFromStageAlignments(
  alignments: RecipeStageAlignment[],
): RecipeYoutubeTimestamp[] {
  const confident = alignments
    .filter(isConfidentStageAlignment)
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

export function parseStageAlignments(raw: unknown): RecipeStageAlignment[] {
  if (!Array.isArray(raw)) return [];
  const rows: RecipeStageAlignment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = String(row.instructionSectionTitle ?? row.title ?? "").trim();
    const stageId = String(row.instructionStageId ?? row.stageId ?? "").trim() || slugStageId(title);
    if (!title && !stageId) continue;

    let seconds =
      typeof row.videoStartSeconds === "number"
        ? row.videoStartSeconds
        : parseTimestampInput(String(row.videoTimestampLabel ?? row.time ?? ""));
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) continue;

    const confidenceRaw = String(row.confidence ?? "UNKNOWN");
    const confidence = (
      ["VERIFIED", "HIGH_CONFIDENCE_INFERENCE", "ESTIMATED", "UNKNOWN"].includes(confidenceRaw)
        ? confidenceRaw
        : "UNKNOWN"
    ) as AiConfidence;

    const sourceRaw = String(row.source ?? "ai_video_analysis");
    const source = (
      sourceRaw === "youtube_description_hint" || sourceRaw === "manual"
        ? sourceRaw
        : "ai_video_analysis"
    ) as StageAlignmentSource;

    rows.push({
      instructionStageId: stageId,
      instructionSectionTitle: title || stageId,
      videoStartSeconds: Math.floor(seconds),
      videoTimestampLabel: String(row.videoTimestampLabel ?? formatClock(Math.floor(seconds))),
      chapterTitle: String(row.chapterTitle ?? title).trim() || title,
      confidence,
      source,
    });
  }

  rows.sort((a, b) => a.videoStartSeconds - b.videoStartSeconds);
  return rows;
}

function slugStageId(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Merge AI stage alignments with optional YouTube description chapter hints.
 * Instruction titles remain canonical; description chapters only hint times/labels.
 */
export function buildStageAlignmentsFromAnalysis(input: {
  instructionStages: { id: string; name: string }[];
  aiAlignments: unknown;
  youtubeHintChapters?: { time: number; label: string }[];
}): RecipeStageAlignment[] {
  const fromAi = parseStageAlignments(input.aiAlignments);
  const byTitle = new Map(
    fromAi.map((row) => [normalizeTitle(row.instructionSectionTitle), row] as const),
  );

  const result: RecipeStageAlignment[] = [];
  for (const stage of input.instructionStages) {
    const existing = byTitle.get(normalizeTitle(stage.name));
    if (existing && isConfidentStageAlignment(existing)) {
      result.push({
        ...existing,
        instructionStageId: stage.id,
        instructionSectionTitle: stage.name,
      });
      continue;
    }

    const hint = findHintChapter(stage.name, input.youtubeHintChapters ?? []);
    if (hint) {
      result.push({
        instructionStageId: stage.id,
        instructionSectionTitle: stage.name,
        videoStartSeconds: hint.time,
        videoTimestampLabel: formatClock(hint.time),
        chapterTitle: hint.label,
        confidence: "HIGH_CONFIDENCE_INFERENCE",
        source: "youtube_description_hint",
      });
      continue;
    }

    if (existing) {
      result.push({
        ...existing,
        instructionStageId: stage.id,
        instructionSectionTitle: stage.name,
        confidence: "UNKNOWN",
      });
    }
  }

  return result;
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findHintChapter(stageName: string, chapters: { time: number; label: string }[]) {
  const stage = normalizeTitle(stageName);
  let best: { time: number; label: string; score: number } | null = null;
  for (const chapter of chapters) {
    const label = normalizeTitle(chapter.label);
    let score = 0;
    if (/stretch|fold|gluten|knead/.test(stage) && /stretch|fold|gluten|knead|develop/.test(label)) {
      score = 6;
    } else if (/shap|proof|crumb/.test(stage) && /shap|proof|crumb|form/.test(label)) {
      score = 5;
    } else if (/scor|steam|bak|oven/.test(stage) && /scor|steam|bak|oven|crust/.test(label)) {
      score = 6;
    } else if (
      /activat|yeast|autolys|mix|foundat/.test(stage) &&
      /foundat|dough|mix|yeast|autolys/.test(label)
    ) {
      score = 5;
    } else if (/divid|pre.?shap|portion/.test(stage) && /divid|portion|pre.?shap|ball/.test(label)) {
      score = 5;
    }
    if (score >= 5 && (!best || score > best.score)) {
      best = { ...chapter, score };
    }
  }
  return best;
}

export function applyStageAlignmentsToYoutubeBlob(
  blob: Record<string, unknown> | null | undefined,
  alignments: RecipeStageAlignment[],
): Record<string, unknown> {
  const next = { ...(blob ?? {}) };
  next.stageAlignments = alignments;
  const canonical = mesaCanonicalChaptersFromStageAlignments(alignments);
  if (canonical.length) {
    next.timestamps = canonical;
  }
  return next;
}
