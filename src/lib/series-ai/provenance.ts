import { aiValuesEqual } from "@/lib/ai-recipe/field-tracking";
import type { SeriesAiFieldProvenance, SeriesAiMergeMode, SeriesAiMeta } from "@/lib/series-ai/types";

export function noteSeriesHumanEdit(
  meta: SeriesAiMeta,
  path: string,
  nextValue: unknown,
): SeriesAiMeta {
  const provenance = meta.fieldProvenance?.[path];
  if (!provenance?.aiGenerated) return meta;
  if (provenance.humanModifiedAfterGeneration) return meta;
  if (aiValuesEqual(provenance.aiGeneratedValue, nextValue)) return meta;
  if (!String(provenance.aiGeneratedValue ?? "").trim() && !String(nextValue ?? "").trim()) {
    return meta;
  }
  return {
    ...meta,
    fieldProvenance: {
      ...meta.fieldProvenance,
      [path]: {
        ...provenance,
        humanModifiedAfterGeneration: true,
      },
    },
  };
}

export function shouldApplySeriesAiField(input: {
  path: string;
  mode: SeriesAiMergeMode;
  meta: SeriesAiMeta;
  isEmpty: boolean;
}): boolean {
  const { path, mode, meta, isEmpty } = input;
  if (mode === "fill_empty") return isEmpty;
  const provenance = meta.fieldProvenance?.[path];
  if (!provenance?.aiGenerated) return isEmpty;
  if (provenance.humanModifiedAfterGeneration && !isEmpty) return false;
  return true;
}

export function buildSeriesProvenanceSnapshot(
  path: string,
  value: unknown,
): SeriesAiFieldProvenance {
  return {
    aiGenerated: true,
    aiGeneratedValue: value,
    humanModifiedAfterGeneration: false,
  };
}

export function seriesFieldIsEmpty(value: unknown): boolean {
  return !String(value ?? "").trim();
}

export function isSeriesAiVerified(meta: SeriesAiMeta | null | undefined): boolean {
  return meta?.verificationStatus === "verified";
}

export function markSeriesAiVerified(meta: SeriesAiMeta): SeriesAiMeta {
  if (!meta.generatedByAI) return meta;
  return {
    ...meta,
    verificationStatus: "verified",
    verifiedAt: new Date().toISOString(),
  };
}
