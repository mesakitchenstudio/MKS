import { aiChaptersFromGeminiRaw } from "@/lib/ai-recipe/youtube-chapters";
import type { NormalizedAiYoutubeChapter } from "@/lib/ai-recipe/youtube-chapters";
import type { RecipeAiMeta, RecipeAiVideoContext } from "@/lib/ai-recipe/types";
import { parseStageAlignments } from "@/lib/ai-recipe/stage-alignments";
import type { RecipeStageAlignment, RecipeYoutubeTimestamp } from "@/data/youtube-types";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";
import { parseTimestampInput } from "@/lib/youtube-metadata-editor";
import {
  classifyStageAlignmentEvidence,
  trustworthyStageAlignmentEvidence,
  type ClassifiedStageAlignmentEvidence,
} from "@/lib/ai-recipe/chapter-suggestions/stage-alignment-evidence";
import { normalizeInstructionGroups } from "@/lib/instruction-chapters";

export type { ClassifiedStageAlignmentEvidence, StageAlignmentEvidenceLineage } from "@/lib/ai-recipe/chapter-suggestions/stage-alignment-evidence";

export type ChapterSuggestionEvidenceBundle = {
  videoId: string;
  videoDurationSeconds?: number;
  /** AI/cache chapters — not used for timestamp suggestions unless VERIFIED. */
  cachedGeminiChapters: NormalizedAiYoutubeChapter[];
  /** Parsed YouTube description chapters — trustworthy timestamp source. */
  youtubeDescriptionChapters: NormalizedAiYoutubeChapter[];
  /** Manual or description-backed stage alignments only. */
  trustworthyStageAlignments: ClassifiedStageAlignmentEvidence[];
  legacyTimestamps: RecipeYoutubeTimestamp[];
  videoContext: RecipeAiVideoContext | null;
  generationCacheUsed: boolean;
  evidenceSources: string[];
};

/** True when Mesa can suggest start times from a trustworthy source (not AI guesswork). */
export function hasTrustworthyTimestampEvidence(bundle: ChapterSuggestionEvidenceBundle): boolean {
  return (
    bundle.youtubeDescriptionChapters.length > 0 ||
    bundle.trustworthyStageAlignments.length > 0
  );
}

export function hasUsableChapterEvidence(bundle: ChapterSuggestionEvidenceBundle): boolean {
  return hasTrustworthyTimestampEvidence(bundle);
}

export function collectChapterSuggestionEvidence(input: {
  values: Record<string, unknown>;
  aiMeta?: RecipeAiMeta | null;
  videoId: string;
  cacheRaw?: unknown | null;
  youtubeDescription?: string | null;
}): ChapterSuggestionEvidenceBundle {
  const evidenceSources: string[] = [];
  const blob = parseRecipeYoutubeBlob(input.values.youtube);
  const rawYoutube =
    input.values.youtube && typeof input.values.youtube === "object"
      ? (input.values.youtube as Record<string, unknown>)
      : null;
  const videoDurationSeconds =
    blob?.duration != null
      ? parseTimestampInput(String(blob.duration)) ?? undefined
      : rawYoutube?.duration != null
        ? parseTimestampInput(String(rawYoutube.duration)) ?? undefined
        : undefined;

  let cachedGeminiChapters: NormalizedAiYoutubeChapter[] = [];
  let generationCacheUsed = false;
  if (input.cacheRaw) {
    cachedGeminiChapters = aiChaptersFromGeminiRaw(input.cacheRaw);
    if (cachedGeminiChapters.length) {
      generationCacheUsed = true;
      evidenceSources.push("generation_cache");
    }
  }

  const rawStageAlignments =
    blob?.stageAlignments?.length
      ? blob.stageAlignments
      : parseStageAlignments(rawYoutube?.stageAlignments ?? []);
  const groups = normalizeInstructionGroups(input.values.instructions);
  const classifiedStageAlignments = classifyStageAlignmentEvidence({
    alignments: rawStageAlignments,
    groups,
  });
  const trustworthyStageAlignments = trustworthyStageAlignmentEvidence(classifiedStageAlignments);
  if (trustworthyStageAlignments.length) evidenceSources.push("stage_alignments");

  const legacyTimestamps = blob?.timestamps?.length
    ? blob.timestamps
    : Array.isArray(rawYoutube?.timestamps)
      ? (rawYoutube.timestamps as RecipeYoutubeTimestamp[]).filter(
          (row) => row && typeof row.time === "number" && row.time >= 0,
        )
      : [];
  if (legacyTimestamps.length) evidenceSources.push("legacy_timestamps");

  let youtubeDescriptionChapters: NormalizedAiYoutubeChapter[] = [];
  if (input.youtubeDescription?.trim()) {
    youtubeDescriptionChapters = parseYoutubeDescriptionChapters(input.youtubeDescription);
    if (youtubeDescriptionChapters.length) evidenceSources.push("youtube_description");
  }

  const videoContext = input.aiMeta?.videoContext ?? null;
  if (videoContext?.instructionStageEvidence?.length) {
    evidenceSources.push("video_context");
  }

  return {
    videoId: input.videoId,
    videoDurationSeconds: videoDurationSeconds ?? undefined,
    cachedGeminiChapters,
    youtubeDescriptionChapters,
    trustworthyStageAlignments,
    legacyTimestamps,
    videoContext,
    generationCacheUsed,
    evidenceSources,
  };
}
