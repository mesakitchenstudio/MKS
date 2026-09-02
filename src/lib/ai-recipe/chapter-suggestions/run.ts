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
  ChapterTimestampSuggestionItem,
} from "@/lib/ai-recipe/chapter-suggestions/types";
import {
  fetchOrAnalyzeVideoChapters,
  VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE,
  type VideoChapterAnalysisDiagnostics,
  type VideoChapterAnalysisStage,
  type VideoChapterSectionHit,
} from "@/lib/ai-recipe/chapter-suggestions/video-chapter-analysis";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import type { InstructionGroupWithChapters } from "@/lib/instruction-chapters";
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
  stage?: VideoChapterAnalysisStage;
  diagnostics?: VideoChapterAnalysisDiagnostics;
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

function sectionTargetsFromGroups(groups: InstructionGroupWithChapters[]) {
  return groups.map((group, index) => ({
    sectionIndex: index,
    title: String(group.name ?? "").trim() || `Section ${index + 1}`,
    steps: Array.isArray(group.steps)
      ? group.steps.map((step) => String(step ?? "").trim()).filter(Boolean)
      : [],
  }));
}

function usableTimestampCount(suggestions: ChapterTimestampSuggestionItem[]) {
  return suggestions.filter((row) => row.status === "suggested" && row.startTimestamp != null).length;
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
  let suggestions: ChapterTimestampSuggestionItem[];
  let sectionHits: VideoChapterSectionHit[] = [];
  let analysisDiagnostics: VideoChapterAnalysisDiagnostics | undefined;

  if (timestampEvidenceAvailable) {
    suggestions = buildDeterministicChapterSuggestions({ groups, evidence, mode });
    suggestionKind = "timestamps";
  } else {
    const sections = sectionTargetsFromGroups(groups);
    let analysis = await fetchOrAnalyzeVideoChapters({
      videoId: context.videoId,
      typeId: context.typeId,
      schemaVersion: context.schemaVersion,
      youtubeUrl: context.youtubeUrl,
      sections,
      cacheRaw: context.cacheRaw,
      forceRefresh: input.forceRefresh === true,
    });

    // Cache present but unusable for mapping → force one fresh analysis.
    if (
      analysis.ok &&
      analysis.fromCache &&
      !input.forceRefresh
    ) {
      const probeEvidence = collectChapterSuggestionEvidence({
        values: input.values,
        aiMeta: input.aiMeta ?? null,
        videoId: context.videoId,
        cacheRaw: analysis.cacheRaw,
        youtubeDescription: context.youtubeDescription,
      });
      const probe = buildAiVideoChapterSuggestions({
        groups,
        evidence: probeEvidence,
        mode,
        sectionHits: analysis.sectionHits,
      });
      if (usableTimestampCount(probe) === 0) {
        analysis = await fetchOrAnalyzeVideoChapters({
          videoId: context.videoId,
          typeId: context.typeId,
          schemaVersion: context.schemaVersion,
          youtubeUrl: context.youtubeUrl,
          sections,
          cacheRaw: context.cacheRaw,
          forceRefresh: true,
        });
      }
    }

    if (!analysis.ok) {
      return {
        ok: false,
        code: analysis.code,
        message: analysis.message,
        stage: analysis.stage,
        diagnostics: analysis.diagnostics,
      };
    }

    analysisDiagnostics = analysis.diagnostics;
    freshVideoAnalysis = analysis.freshAnalysis;
    geminiUsed = true;
    strategy = "deterministic+gemini";
    sectionHits = analysis.sectionHits;

    workingEvidence = collectChapterSuggestionEvidence({
      values: input.values,
      aiMeta: input.aiMeta ?? null,
      videoId: context.videoId,
      cacheRaw: analysis.cacheRaw,
      youtubeDescription: context.youtubeDescription,
    });

    if (
      !hasVideoTemporalAnalysisAvailable(workingEvidence) &&
      !sectionHits.some((hit) => hit.matched && hit.startTimestamp != null)
    ) {
      return {
        ok: false,
        code: "video_analysis_failed",
        stage: "VIDEO_ANALYSIS_EMPTY",
        message: VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE,
        diagnostics: analysis.diagnostics,
      };
    }

    suggestions = buildAiVideoChapterSuggestions({
      groups,
      evidence: workingEvidence,
      mode,
      sectionHits,
    });
    suggestionKind = "ai_video_timestamps";

    // Partial success: keep batch when any usable timestamps exist.
    // Total failure only when zero useful temporal mappings.
    if (usableTimestampCount(suggestions) === 0) {
      return {
        ok: false,
        code: "video_analysis_failed",
        stage: "VIDEO_ANALYSIS_NO_SECTION_MATCH",
        message: VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE,
        diagnostics: {
          ...analysis.diagnostics,
          stage: "VIDEO_ANALYSIS_NO_SECTION_MATCH",
          matchedSectionCount: 0,
        },
      };
    }
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
      analysisDiagnostics,
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
  analysisDiagnostics?: VideoChapterAnalysisDiagnostics;
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
      analysisStage: input.analysisDiagnostics?.stage,
      analysisModel: input.analysisDiagnostics?.model,
      analysisRawChapterCount: input.analysisDiagnostics?.rawChapterCount,
      analysisMatchedSectionCount: input.analysisDiagnostics?.matchedSectionCount,
    },
  };
}
