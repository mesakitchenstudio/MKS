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

export type RecipeAiMeta = {
  generatedByAI: boolean;
  sourceType: "youtube";
  sourceUrl: string;
  generatedAt: string;
  model: string;
  schemaVersion: string;
  verificationStatus: AiVerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  /** Field path → confidence (e.g. title, values.intro, values.ingredients.0.items.1) */
  confidenceByPath: Record<string, AiFieldAnnotation>;
  summary: {
    verified: number;
    inferred: number;
    estimated: number;
    unknown: number;
  };
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
    if (!parsed || typeof parsed !== "object" || !parsed.generatedByAI) return null;
    return {
      generatedByAI: true,
      sourceType: "youtube",
      sourceUrl: String(parsed.sourceUrl || ""),
      generatedAt: String(parsed.generatedAt || ""),
      model: String(parsed.model || ""),
      schemaVersion: String(parsed.schemaVersion || ""),
      verificationStatus:
        parsed.verificationStatus === "verified"
          ? "verified"
          : parsed.verificationStatus === "unverified"
            ? "unverified"
            : "none",
      verifiedAt: parsed.verifiedAt ? String(parsed.verifiedAt) : undefined,
      verifiedBy: parsed.verifiedBy ? String(parsed.verifiedBy) : undefined,
      confidenceByPath:
        parsed.confidenceByPath && typeof parsed.confidenceByPath === "object"
          ? (parsed.confidenceByPath as Record<string, AiFieldAnnotation>)
          : {},
      summary: {
        verified: Number(parsed.summary?.verified || 0),
        inferred: Number(parsed.summary?.inferred || 0),
        estimated: Number(parsed.summary?.estimated || 0),
        unknown: Number(parsed.summary?.unknown || 0),
      },
    };
  } catch {
    return null;
  }
}

export function serializeRecipeAiMeta(meta: RecipeAiMeta | null | undefined) {
  if (!meta) return "{}";
  return JSON.stringify(meta);
}

export function confidenceLabel(confidence: AiConfidence): string {
  switch (confidence) {
    case "VERIFIED":
      return "Verified from video";
    case "HIGH_CONFIDENCE_INFERENCE":
      return "Inferred";
    case "ESTIMATED":
      return "Estimate — verify";
    case "UNKNOWN":
      return "Needs input";
  }
}
