import type { AiConfidence, RecipeAiMeta } from "@/lib/ai-recipe/types";
import type { AiFieldProvenance } from "@/lib/ai-recipe/field-tracking";

/** Where the current displayed value came from. Undefined for legacy UNKNOWN confidence. */
export type FieldSource = "from_video" | "inferred" | "template" | "staff";

export type FieldReviewState = "unreviewed" | "edited" | "confirmed" | "locked";

export type FieldCompleteness = "missing" | "partial" | "filled";

export type AttentionLevel = "required" | "recommended" | "optional";

export function legacyConfidenceToSource(confidence: AiConfidence | undefined): FieldSource | undefined {
  switch (confidence) {
    case "VERIFIED":
      return "from_video";
    case "HIGH_CONFIDENCE_INFERENCE":
    case "ESTIMATED":
      return "inferred";
    case "UNKNOWN":
      return undefined;
    default:
      return undefined;
  }
}

export function sourceDisplayLabel(source: FieldSource | undefined): string {
  switch (source) {
    case "from_video":
      return "From video";
    case "inferred":
      return "Inferred";
    case "template":
      return "Template";
    case "staff":
      return "Staff";
    default:
      return "Needs input";
  }
}

export function resolveFieldReviewState(
  path: string,
  meta: RecipeAiMeta | null | undefined,
): FieldReviewState {
  const provenance = meta?.fieldProvenance?.[path];
  if (provenance?.reviewState) return provenance.reviewState;
  if (provenance?.humanModifiedAfterGeneration) return "edited";
  return "unreviewed";
}

export function resolveFieldSource(
  path: string,
  meta: RecipeAiMeta | null | undefined,
): FieldSource | undefined {
  if (path === "values.nutrition") {
    const provenance = meta?.fieldProvenance?.[path];
    if (provenance?.source && provenance.source !== "from_video") return provenance.source;
    return "inferred";
  }
  const provenance = meta?.fieldProvenance?.[path];
  if (provenance?.source) return provenance.source;
  if (provenance?.humanModifiedAfterGeneration) return "staff";
  return legacyConfidenceToSource(meta?.confidenceByPath?.[path]?.confidence);
}

export function fieldNeedsHumanReview(input: {
  path: string;
  meta: RecipeAiMeta | null | undefined;
  isEmpty: boolean;
}): boolean {
  if (input.isEmpty) return false;

  const reviewState = resolveFieldReviewState(input.path, input.meta);
  if (reviewState === "edited" || reviewState === "confirmed" || reviewState === "locked") {
    return false;
  }

  // reviewState === "unreviewed"
  const source = resolveFieldSource(input.path, input.meta);
  if (source === "staff") return false;
  if (source === "from_video" || source === "inferred" || source === "template") {
    return true;
  }

  const confidence = input.meta?.confidenceByPath?.[input.path]?.confidence;
  if (input.path === "values.nutrition") {
    return confidence === "ESTIMATED" || confidence === "HIGH_CONFIDENCE_INFERENCE";
  }
  if (confidence === "VERIFIED" || confidence === "HIGH_CONFIDENCE_INFERENCE" || confidence === "ESTIMATED") {
    return true;
  }
  return false;
}

export function isFieldProtectedFromBulkAi(
  path: string,
  meta: RecipeAiMeta | null | undefined,
): boolean {
  const reviewState = resolveFieldReviewState(path, meta);
  return reviewState === "edited" || reviewState === "confirmed" || reviewState === "locked";
}

export function isFieldLocked(path: string, meta: RecipeAiMeta | null | undefined): boolean {
  return resolveFieldReviewState(path, meta) === "locked";
}

export function buildProvenanceAfterAiApply(input: {
  path: string;
  value: unknown;
  confidence?: AiConfidence;
  previous?: AiFieldProvenance;
}): AiFieldProvenance {
  const isNutrition = input.path === "values.nutrition";
  const confidence: AiConfidence | undefined = isNutrition ? "ESTIMATED" : input.confidence;
  const mapped = legacyConfidenceToSource(confidence);
  const source: FieldSource = isNutrition ? "inferred" : mapped ?? "inferred";
  return {
    aiGenerated: true,
    aiGeneratedValue: input.value,
    humanModifiedAfterGeneration: false,
    reviewState: "unreviewed",
    source,
    originalAi: input.previous?.originalAi ?? {
      value: input.value,
      source,
      confidence,
    },
  };
}

export function buildProvenanceAfterStaffEdit(input: {
  path: string;
  nextValue: unknown;
  previous?: AiFieldProvenance;
}): AiFieldProvenance {
  const prior = input.previous;
  return {
    aiGenerated: prior?.aiGenerated ?? true,
    aiGeneratedValue: prior?.aiGeneratedValue ?? input.nextValue,
    humanModifiedAfterGeneration: true,
    reviewState: "edited",
    source: "staff",
    originalAi:
      prior?.originalAi ??
      (prior
        ? {
            value: prior.aiGeneratedValue,
            source: prior.source,
          }
        : undefined),
  };
}

export function buildProvenanceAfterConfirm(input: {
  path: string;
  value: unknown;
  previous?: AiFieldProvenance;
}): AiFieldProvenance {
  const prior = input.previous;
  return {
    aiGenerated: prior?.aiGenerated ?? true,
    aiGeneratedValue: prior?.aiGeneratedValue ?? input.value,
    humanModifiedAfterGeneration: prior?.humanModifiedAfterGeneration ?? false,
    reviewState: "confirmed",
    source: prior?.source ?? "staff",
    originalAi: prior?.originalAi,
  };
}

export function buildProvenanceAfterLock(input: {
  path: string;
  value: unknown;
  previous?: AiFieldProvenance;
}): AiFieldProvenance {
  const prior = input.previous;
  const currentReview = prior?.reviewState ?? (prior?.humanModifiedAfterGeneration ? "edited" : "unreviewed");
  return {
    aiGenerated: prior?.aiGenerated ?? true,
    aiGeneratedValue: prior?.aiGeneratedValue ?? input.value,
    humanModifiedAfterGeneration: prior?.humanModifiedAfterGeneration ?? false,
    reviewState: "locked",
    source: prior?.source ?? "staff",
    originalAi: prior?.originalAi,
    lockedFromReviewState: currentReview === "locked" ? prior?.lockedFromReviewState ?? "unreviewed" : currentReview,
  };
}

export function buildProvenanceAfterUnlock(input: {
  path: string;
  value: unknown;
  previous?: AiFieldProvenance;
}): AiFieldProvenance {
  const prior = input.previous;
  const restored =
    prior?.lockedFromReviewState ??
    (prior?.humanModifiedAfterGeneration ? "edited" : prior?.reviewState === "confirmed" ? "confirmed" : "unreviewed");
  return {
    aiGenerated: prior?.aiGenerated ?? true,
    aiGeneratedValue: prior?.aiGeneratedValue ?? input.value,
    humanModifiedAfterGeneration: prior?.humanModifiedAfterGeneration ?? false,
    reviewState: restored === "locked" ? "unreviewed" : restored,
    source: prior?.source ?? "staff",
    originalAi: prior?.originalAi,
  };
}
