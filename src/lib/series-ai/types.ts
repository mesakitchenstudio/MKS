export type SeriesAiMergeMode = "fill_empty" | "replace_ai";

export type SeriesAiFieldProvenance = {
  aiGenerated: true;
  aiGeneratedValue: unknown;
  humanModifiedAfterGeneration: boolean;
};

export type SeriesHeroImageSource =
  | ""
  | "auto_featured_recipe"
  | "auto_featured_video"
  | "auto_recipe"
  | "auto_playlist"
  | "auto_video"
  | "manual";

export type SeriesAiMeta = {
  generatedByAI: boolean;
  generatedAt?: string;
  model?: string;
  verificationStatus: "none" | "unverified" | "verified";
  verifiedAt?: string;
  verifiedBy?: string;
  draftStatus?: "complete" | "needs_review" | "partial" | "failed";
  mergeModeLastUsed?: SeriesAiMergeMode;
  fieldProvenance?: Record<string, SeriesAiFieldProvenance>;
  /** When true, AI/system must not change which item is featured. */
  featuredChosenByHuman?: boolean;
  lastError?: string;
};

export const SERIES_AI_SCALAR_PATHS = [
  "title",
  "shortTitle",
  "description",
  "intro",
  "seoTitle",
  "seoDescription",
] as const;

export type SeriesAiScalarPath = (typeof SERIES_AI_SCALAR_PATHS)[number];

export function itemCustomTitlePath(itemId: string) {
  return `items.${itemId}.customTitle`;
}

export function itemCustomDescriptionPath(itemId: string) {
  return `items.${itemId}.customDescription`;
}

export function emptySeriesAiMeta(): SeriesAiMeta {
  return {
    generatedByAI: false,
    verificationStatus: "none",
    fieldProvenance: {},
  };
}

export function parseSeriesAiMeta(raw: string | null | undefined): SeriesAiMeta {
  if (!raw || raw === "{}") return emptySeriesAiMeta();
  try {
    const parsed = JSON.parse(raw) as Partial<SeriesAiMeta>;
    if (!parsed || typeof parsed !== "object") return emptySeriesAiMeta();
    return {
      generatedByAI: Boolean(parsed.generatedByAI),
      generatedAt: parsed.generatedAt ? String(parsed.generatedAt) : undefined,
      model: parsed.model ? String(parsed.model) : undefined,
      verificationStatus:
        parsed.verificationStatus === "verified"
          ? "verified"
          : parsed.verificationStatus === "unverified"
            ? "unverified"
            : "none",
      verifiedAt: parsed.verifiedAt ? String(parsed.verifiedAt) : undefined,
      verifiedBy: parsed.verifiedBy ? String(parsed.verifiedBy) : undefined,
      draftStatus:
        parsed.draftStatus === "complete" ||
        parsed.draftStatus === "needs_review" ||
        parsed.draftStatus === "partial" ||
        parsed.draftStatus === "failed"
          ? parsed.draftStatus
          : undefined,
      mergeModeLastUsed:
        parsed.mergeModeLastUsed === "fill_empty" || parsed.mergeModeLastUsed === "replace_ai"
          ? parsed.mergeModeLastUsed
          : undefined,
      fieldProvenance:
        parsed.fieldProvenance && typeof parsed.fieldProvenance === "object"
          ? (parsed.fieldProvenance as Record<string, SeriesAiFieldProvenance>)
          : {},
      featuredChosenByHuman: Boolean(parsed.featuredChosenByHuman),
      lastError: parsed.lastError ? String(parsed.lastError) : undefined,
    };
  } catch {
    return emptySeriesAiMeta();
  }
}

export function serializeSeriesAiMeta(meta: SeriesAiMeta | null | undefined) {
  if (!meta) return "{}";
  return JSON.stringify(meta);
}
