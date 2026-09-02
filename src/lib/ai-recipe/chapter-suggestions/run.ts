import { randomUUID } from "node:crypto";
import {
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
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";

export type RunChapterSuggestionsInput = {
  typeId: string;
  youtubeUrl?: string;
  values: Record<string, unknown>;
  title?: string;
  aiMeta?: RecipeAiMeta | null;
  mode?: ChapterSuggestionMode;
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
    | "invalid_type";
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
  const capability = resolveChapterSuggestionCapability(evidence);
  const timestampEvidenceAvailable = hasTrustworthyTimestampEvidence(evidence);
  const videoTemporalAnalysisAvailable = hasVideoTemporalAnalysisAvailable(evidence);

  let suggestions;
  let suggestionKind: "timestamps" | "ai_video_timestamps" | "titles" = "titles";
  let strategy: "deterministic" | "deterministic+gemini" = "deterministic";
  let geminiUsed = false;

  if (timestampEvidenceAvailable) {
    suggestions = buildDeterministicChapterSuggestions({ groups, evidence, mode });
    suggestionKind = "timestamps";
  } else if (videoTemporalAnalysisAvailable) {
    suggestions = buildAiVideoChapterSuggestions({ groups, evidence, mode });
    suggestionKind = "ai_video_timestamps";
    strategy = "deterministic+gemini";
    geminiUsed = true;
  } else {
    suggestions = buildChapterTitleSuggestions({ groups, mode });
    suggestionKind = "titles";
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

  if (capability !== "titles") {
    const applicable = suggestions.filter(
      (row) => row.status === "suggested" && row.startTimestamp != null,
    );
    if (!applicable.length && capability === "youtube_chapters") {
      return {
        ok: false,
        code: "no_suggestions",
        message: "No reliable timestamp suggestions could be produced from available sources.",
      };
    }
  }

  const batch: ChapterSuggestionBatch = {
    requestId: randomUUID(),
    generatedAt: new Date().toISOString(),
    mode,
    instructionSnapshotFingerprint: instructionSnapshotFingerprint(groups),
    suggestions,
    diagnostics: {
      strategy,
      evidenceSources: evidence.evidenceSources,
      sectionsRequested:
        mode === "all"
          ? groups.length
          : groups.filter((group) => group.startTimestamp == null).length,
      sectionsSuggested: suggestions.filter((row) => row.status === "suggested").length,
      sectionsNoEvidence: suggestions.filter((row) => row.status === "no_evidence").length,
      sectionsConflict: suggestions.filter((row) => row.status === "conflict").length,
      generationCacheUsed: evidence.generationCacheUsed,
      geminiUsed,
      latencyMs: Date.now() - started,
      timestampEvidenceAvailable,
      videoTemporalAnalysisAvailable,
      capability,
      suggestionKind,
    },
  };

  return { ok: true, batch, capability };
}
