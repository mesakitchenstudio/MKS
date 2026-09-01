import { aiChaptersFromGeminiRaw } from "@/lib/ai-recipe/youtube-chapters";
import type { NormalizedAiYoutubeChapter } from "@/lib/ai-recipe/youtube-chapters";
import type { RecipeAiMeta, RecipeAiVideoContext } from "@/lib/ai-recipe/types";
import { parseStageAlignments } from "@/lib/ai-recipe/stage-alignments";
import type { RecipeStageAlignment, RecipeYoutubeTimestamp } from "@/data/youtube-types";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";
import { parseTimestampInput } from "@/lib/youtube-metadata-editor";

export type ChapterSuggestionEvidenceBundle = {
  videoId: string;
  videoDurationSeconds?: number;
  cachedGeminiChapters: NormalizedAiYoutubeChapter[];
  stageAlignments: RecipeStageAlignment[];
  youtubeDescriptionChapters: NormalizedAiYoutubeChapter[];
  legacyTimestamps: RecipeYoutubeTimestamp[];
  videoContext: RecipeAiVideoContext | null;
  generationCacheUsed: boolean;
  evidenceSources: string[];
};

export function hasUsableChapterEvidence(bundle: ChapterSuggestionEvidenceBundle): boolean {
  return (
    bundle.cachedGeminiChapters.length > 0 ||
    bundle.stageAlignments.some((row) => row.videoStartSeconds >= 0) ||
    bundle.youtubeDescriptionChapters.length > 0 ||
    bundle.legacyTimestamps.length > 0 ||
    Boolean(bundle.videoContext?.instructionStageEvidence?.length)
  );
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

  const stageAlignments =
    blob?.stageAlignments?.length
      ? blob.stageAlignments
      : parseStageAlignments(rawYoutube?.stageAlignments ?? []);
  if (stageAlignments.length) evidenceSources.push("stage_alignments");

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
    stageAlignments,
    youtubeDescriptionChapters,
    legacyTimestamps,
    videoContext,
    generationCacheUsed,
    evidenceSources,
  };
}
