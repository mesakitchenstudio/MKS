import { randomUUID } from "node:crypto";
import {
  collectChapterSuggestionEvidence,
  hasTrustworthyTimestampEvidence,
  hasVideoTemporalAnalysisAvailable,
  resolveChapterSuggestionCapability,
} from "@/lib/ai-recipe/chapter-suggestions/evidence";
import {
  buildAiVideoChapterSuggestions,
  buildChapterTitleSuggestions,
  buildDeterministicChapterSuggestions,
} from "@/lib/ai-recipe/chapter-suggestions/build";
import { loadChapterSuggestionContext } from "@/lib/ai-recipe/chapter-suggestions/context";
import { instructionSnapshotFingerprint } from "@/lib/ai-recipe/chapter-suggestions/fingerprints";
import type {
  ChapterSuggestionBatch,
  ChapterSuggestionCapability,
  ChapterSuggestionMode,
} from "@/lib/ai-recipe/chapter-suggestions/types";
import {
  fetchOrAnalyzeVideoChapters,
  VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE,
} from "@/lib/ai-recipe/chapter-suggestions/video-chapter-analysis";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import type { InstructionGroupWithChapters } from "@/lib/instruction-chapters";
import type { ChapterTimestampSuggestionItem } from "@/lib/ai-recipe/chapter-suggestions/types";
import type { ChapterSuggestionEvidenceBundle } from "@/lib/ai-recipe/chapter-suggestions/evidence";

export type RunChapterSuggestionsInput = {
  typeId: string;
  youtubeUrl?: string;
  values: Record<string, unknown>;
  title?: string;
  aiMeta?: RecipeAiMeta | null;
  mode?: ChapterSuggestionMode;
  /** When true, bypass cached Gemini chapters and rerun video analysis. */
  forceRefresh?: boolean;
  /** Skip video analysis and return title-only suggestions. */
  titlesOnly?: boolean;
};

export type RunChapterSuggestionsSuccess = {
  ok: true;
  batch: ChapterSuggestionBatch;
  capability: ChapterSuggestionCapability;
};

export type RunChapterSuggestionsFailure = {
  ok: false;
  code:
    | "bad_request"
    | "no_video"
    | "insufficient_evidence"
    | "no_suggestions"
    | "invalid_type"
    | "video_analysis_failed"
    | "video_analysis_unconfigured";
  message: string;
};

export async function resolveChapterSuggestionCapabilityForRecipe(
  input: RunChapterSuggestionsInput,
): Promise<
  | { ok: true; capability: ChapterSuggestionCapability }
  | RunChapterSuggestionsFailure
> {
  const context = await loadChapterSuggestionContext(input);
  if (!context.ok) {
    return { ok: false, code: context.code, message: context.message };
  }
  return {
    ok: true,
    capability: resolveChapterSuggestionCapability(context.evidence),
  };
}

export async function runChapterTimestampSuggestions(
  input: RunChapterSuggestionsInput,
): Promise<RunChapterSuggestionsSuccess | RunChapterSuggestionsFailure> {
  const started = Date.now();
  const mode: ChapterSuggestionMode = input.mode === "all" ? "all" : "missing";

  const context = await loadChapterSuggestionContext(input);
  if (!context.ok) {
    return { ok: false, code: context.code, message: context.message };
  }

  const { groups, evidence } = context;
  let workingEvidence = evidence;
  const capability = resolveChapterSuggestionCapability(evidence);
  const timestampEvidenceAvailable = hasTrustworthyTimestampEvidence(evidence);

  if (input.titlesOnly) {
    const suggestions = buildChapterTitleSuggestions({ groups, mode });
    if (!suggestions.length) {
      return {
        ok: false,
        code: "no_suggestions",
        message: "No chapter title suggestions are needed for the current sections.",
      };
    }
    return {
      ok: true,
      capability: "titles",
      batch: buildBatch({
        groups,
        evidence,
        mode,
        suggestions,
        started,
        capability: "titles",
        suggestionKind: "titles",
        strategy: "deterministic",
        geminiUsed: false,
        freshVideoAnalysis: false,
        generationCacheUsed: evidence.generationCacheUsed,
        timestampEvidenceAvailable,
      }),
    };
  }

  let strategy: "deterministic" | "deterministic+gemini" = "deterministic";
  let geminiUsed = false;
  let freshVideoAnalysis = false;
  let suggestionKind: "timestamps" | "ai_video_timestamps" | "titles" = "titles";
  let suggestions;

  if (timestampEvidenceAvailable) {
    suggestions = buildDeterministicChapterSuggestions({ groups, evidence, mode });
    suggestionKind = "timestamps";
  } else {
    const sectionTitles = groups.map(
      (group, index) => String(group.name ?? "").trim() || `Section ${index + 1}`,
    );
    const analysis = await fetchOrAnalyzeVideoChapters({
      videoId: context.videoId,
      typeId: context.typeId,
      schemaVersion: context.schemaVersion,
      youtubeUrl: context.youtubeUrl,
      sectionTitles,
      cacheRaw: context.cacheRaw,
      forceRefresh: input.forceRefresh === true,
    });

    if (!analysis.ok) {
      return {
        ok: false,
        code: analysis.code,
        message: analysis.message,
      };
    }

    freshVideoAnalysis = analysis.freshAnalysis;
    geminiUsed = true;
    strategy = "deterministic+gemini";

    workingEvidence = collectChapterSuggestionEvidence({
      values: input.values,
      aiMeta: input.aiMeta ?? null,
      videoId: context.videoId,
      cacheRaw: analysis.cacheRaw,
      youtubeDescription: context.youtubeDescription,
    });

    if (!hasVideoTemporalAnalysisAvailable(workingEvidence)) {
      return {
        ok: false,
        code: "video_analysis_failed",
        message: VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE,
      };
    }

    suggestions = buildAiVideoChapterSuggestions({ groups, evidence: workingEvidence, mode });
    suggestionKind = "ai_video_timestamps";
  }

  if (!suggestions.length) {
    return {
      ok: false,
      code: "no_suggestions",
      message:
        capability === "titles"
          ? "No chapter title suggestions are needed for the current sections."
          : "No reliable timestamp suggestions could be produced from available sources.",
    };
  }

  if (capability === "youtube_chapters") {
    const applicable = suggestions.filter(
      (row) => row.status === "suggested" && row.startTimestamp != null,
    );
    if (!applicable.length) {
      return {
        ok: false,
        code: "no_suggestions",
        message: "No reliable timestamp suggestions could be produced from available sources.",
      };
    }
  }

  return {
    ok: true,
    capability: timestampEvidenceAvailable ? "youtube_chapters" : "ai_video",
    batch: buildBatch({
      groups,
      evidence: workingEvidence,
      mode,
      suggestions,
      started,
      capability: timestampEvidenceAvailable ? "youtube_chapters" : "ai_video",
      suggestionKind,
      strategy,
      geminiUsed,
      freshVideoAnalysis,
      generationCacheUsed: workingEvidence.generationCacheUsed,
      timestampEvidenceAvailable,
    }),
  };
}

function buildBatch(input: {
  groups: InstructionGroupWithChapters[];
  evidence: ChapterSuggestionEvidenceBundle;
  mode: ChapterSuggestionMode;
  suggestions: ChapterTimestampSuggestionItem[];
  started: number;
  capability: ChapterSuggestionCapability;
  suggestionKind: "timestamps" | "ai_video_timestamps" | "titles";
  strategy: "deterministic" | "deterministic+gemini";
  geminiUsed: boolean;
  freshVideoAnalysis: boolean;
  generationCacheUsed: boolean;
  timestampEvidenceAvailable: boolean;
}): ChapterSuggestionBatch {
  return {
    requestId: randomUUID(),
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    instructionSnapshotFingerprint: instructionSnapshotFingerprint(input.groups),
    suggestions: input.suggestions,
    diagnostics: {
      strategy: input.strategy,
      evidenceSources: input.evidence.evidenceSources,
      sectionsRequested:
        input.mode === "all"
          ? input.groups.length
          : input.groups.filter((group) => group.startTimestamp == null).length,
      sectionsSuggested: input.suggestions.filter((row) => row.status === "suggested").length,
      sectionsNoEvidence: input.suggestions.filter((row) => row.status === "no_evidence").length,
      sectionsConflict: input.suggestions.filter((row) => row.status === "conflict").length,
      generationCacheUsed: input.generationCacheUsed,
      geminiUsed: input.geminiUsed,
      freshVideoAnalysis: input.freshVideoAnalysis,
      latencyMs: Date.now() - input.started,
      timestampEvidenceAvailable: input.timestampEvidenceAvailable,
      videoTemporalAnalysisAvailable: hasVideoTemporalAnalysisAvailable(input.evidence),
      capability: input.capability,
      suggestionKind: input.suggestionKind,
    },
  };
}
