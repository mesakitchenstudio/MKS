export const AI_CONFIDENCE_LEVELS = [
  "VERIFIED",
  "HIGH_CONFIDENCE_INFERENCE",
  "ESTIMATED",
  "UNKNOWN",
] as const;

export type AiConfidence = (typeof AI_CONFIDENCE_LEVELS)[number];

export type AiFieldAnnotation = {
  confidence: AiConfidence;
  sourceNote: string;
};

export type AiVerificationStatus = "none" | "unverified" | "verified";

import type { AiFieldProvenance } from "@/lib/ai-recipe/field-tracking";

export type RecipeAiVideoContext = {
  linkedVideoId: string;
  schemaVersion: string;
  model: string;
  videoDuration?: string;
  semanticSummary?: string;
  dishContext?: string;
  ingredientEvidence?: string[];
  instructionStageEvidence?: { title: string; notes?: string }[];
  timingNotes?: string;
  generatedAt: string;
};

export type RecipeAiMeta = {
  generatedByAI: boolean;
  sourceType: "youtube";
  sourceUrl: string;
  /** YouTube video ID from the last successful generation. */
  sourceVideoId?: string;
  generatedAt: string;
  model: string;
  schemaVersion: string;
  verificationStatus: AiVerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  /** Field path → AI origin snapshot (title, values.intro, …). */
  fieldProvenance?: Record<string, AiFieldProvenance>;
  /** Field path → confidence (e.g. title, values.intro, values.ingredients.0.items.1) */
  confidenceByPath: Record<string, AiFieldAnnotation>;
  summary: {
    verified: number;
    inferred: number;
    estimated: number;
    unknown: number;
  };
  /**
   * Compact reusable video analysis for targeted fills.
   * Full Gemini JSON remains in AiRecipeGenerationCache.
   */
  videoContext?: RecipeAiVideoContext;
  /** How the Mesa recipe type was chosen when creating from YouTube. */
  recipeTypeSource?: "ai" | "manual";
  recipeTypeConfidence?: "HIGH" | "MEDIUM" | "LOW";
  /** Editor manually confirmed or changed the recipe type. */
  recipeTypeConfirmed?: boolean;
  /**
   * Provenance for Recipe.values.image (Hero image).
   * youtube_thumbnail = inherited from linked YouTube video; may be replaced on Change video.
   * manual_* = editor-owned; Sync / Change video must not overwrite.
   */
  heroImageSource?: "youtube_thumbnail" | "manual_upload" | "manual_url";
  /** When heroImageSource is youtube_thumbnail, the video ID that supplied it. */
  heroImageYoutubeVideoId?: string;
};

export type AiConfidentScalar<T> = {
  value: T;
  confidence: AiConfidence;
  sourceNote: string;
};

export function isAiConfidence(value: unknown): value is AiConfidence {
  return typeof value === "string" && (AI_CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

export function emptyAiSummary() {
  return { verified: 0, inferred: 0, estimated: 0, unknown: 0 };
}

export function tallyConfidence(confidence: AiConfidence, summary: RecipeAiMeta["summary"]) {
  if (confidence === "VERIFIED") summary.verified += 1;
  else if (confidence === "HIGH_CONFIDENCE_INFERENCE") summary.inferred += 1;
  else if (confidence === "ESTIMATED") summary.estimated += 1;
  else summary.unknown += 1;
}

export function parseRecipeAiMeta(raw: string | null | undefined): RecipeAiMeta | null {
  if (!raw || raw === "{}") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RecipeAiMeta>;
    if (!parsed || typeof parsed !== "object") return null;

    const base = {
      sourceType: "youtube" as const,
      sourceUrl: String(parsed.sourceUrl || ""),
      sourceVideoId: parsed.sourceVideoId ? String(parsed.sourceVideoId) : undefined,
      generatedAt: String(parsed.generatedAt || ""),
      model: String(parsed.model || ""),
      schemaVersion: String(parsed.schemaVersion || ""),
      verificationStatus: (parsed.verificationStatus === "verified"
        ? "verified"
        : parsed.verificationStatus === "unverified"
          ? "unverified"
          : "none") as AiVerificationStatus,
      verifiedAt: parsed.verifiedAt ? String(parsed.verifiedAt) : undefined,
      verifiedBy: parsed.verifiedBy ? String(parsed.verifiedBy) : undefined,
      confidenceByPath:
        parsed.confidenceByPath && typeof parsed.confidenceByPath === "object"
          ? (parsed.confidenceByPath as Record<string, AiFieldAnnotation>)
          : {},
      fieldProvenance:
        parsed.fieldProvenance && typeof parsed.fieldProvenance === "object"
          ? (parsed.fieldProvenance as Record<string, AiFieldProvenance>)
          : undefined,
      summary: {
        verified: Number(parsed.summary?.verified || 0),
        inferred: Number(parsed.summary?.inferred || 0),
        estimated: Number(parsed.summary?.estimated || 0),
        unknown: Number(parsed.summary?.unknown || 0),
      },
      recipeTypeSource: parsed.recipeTypeSource,
      recipeTypeConfidence: parsed.recipeTypeConfidence,
      recipeTypeConfirmed: parsed.recipeTypeConfirmed,
      heroImageSource:
        parsed.heroImageSource === "youtube_thumbnail" ||
        parsed.heroImageSource === "manual_upload" ||
        parsed.heroImageSource === "manual_url"
          ? parsed.heroImageSource
          : undefined,
      heroImageYoutubeVideoId: parsed.heroImageYoutubeVideoId
        ? String(parsed.heroImageYoutubeVideoId)
        : undefined,
      videoContext: parseVideoContext(parsed.videoContext),
    };

    if (!parsed.generatedByAI) {
      if (parsed.recipeTypeSource || parsed.sourceVideoId || parsed.heroImageSource) {
        return {
          generatedByAI: false,
          ...base,
        };
      }
      return null;
    }

    return {
      generatedByAI: true,
      ...base,
    };
  } catch {
    return null;
  }
}

export function serializeRecipeAiMeta(meta: RecipeAiMeta | null | undefined) {
  if (!meta) return "{}";
  return JSON.stringify(meta);
}

function parseVideoContext(raw: unknown): RecipeAiVideoContext | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const linkedVideoId = String(row.linkedVideoId ?? "").trim();
  if (!linkedVideoId) return undefined;
  return {
    linkedVideoId,
    schemaVersion: String(row.schemaVersion ?? ""),
    model: String(row.model ?? ""),
    videoDuration: row.videoDuration ? String(row.videoDuration) : undefined,
    semanticSummary: row.semanticSummary ? String(row.semanticSummary) : undefined,
    dishContext: row.dishContext ? String(row.dishContext) : undefined,
    ingredientEvidence: Array.isArray(row.ingredientEvidence)
      ? row.ingredientEvidence.map((item) => String(item)).filter(Boolean).slice(0, 40)
      : undefined,
    instructionStageEvidence: Array.isArray(row.instructionStageEvidence)
      ? row.instructionStageEvidence
          .flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const stage = item as { title?: string; notes?: string };
            const title = String(stage.title ?? "").trim();
            if (!title) return [];
            return [{ title, notes: stage.notes ? String(stage.notes) : undefined }];
          })
          .slice(0, 20)
      : undefined,
    timingNotes: row.timingNotes ? String(row.timingNotes) : undefined,
    generatedAt: String(row.generatedAt ?? ""),
  };
}

export function confidenceLabel(confidence: AiConfidence): string {
  switch (confidence) {
    case "VERIFIED":
      return "From video";
    case "HIGH_CONFIDENCE_INFERENCE":
      return "Inferred";
    case "ESTIMATED":
      return "Estimate — verify";
    case "UNKNOWN":
      return "Needs input";
  }
}

/** Tallies for assistant display — semantic labels applied in UI. */
export function assistantCountLabels(summary: RecipeAiMeta["summary"]) {
  return {
    fromVideo: summary.verified,
    needsReview: summary.inferred + summary.estimated + summary.unknown,
    inferred: summary.inferred,
    estimated: summary.estimated,
    unknown: summary.unknown,
  };
}
