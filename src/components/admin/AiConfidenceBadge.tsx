"use client";

import type { AiConfidence } from "@/lib/ai-recipe/types";
import { confidenceLabel } from "@/lib/ai-recipe/types";

/** Quiet provenance metadata — text only, not pills/chips. */
const styles: Record<AiConfidence, string> = {
  VERIFIED: "text-olive",
  HIGH_CONFIDENCE_INFERENCE: "text-olive/80",
  ESTIMATED: "text-terracotta",
  UNKNOWN: "text-terracotta",
};

export function AiConfidenceBadge({
  confidence,
  sourceNote,
}: {
  confidence?: AiConfidence;
  sourceNote?: string;
}) {
  if (!confidence) return null;
  const title = sourceNote?.trim() || confidenceLabel(confidence);
  return (
    <span
      className={`shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.08em] ${styles[confidence]}`}
      title={title}
    >
      {confidenceLabel(confidence)}
    </span>
  );
}
