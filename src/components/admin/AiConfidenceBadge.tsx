"use client";

import type { AiConfidence } from "@/lib/ai-recipe/types";
import { confidenceLabel } from "@/lib/ai-recipe/types";

const styles: Record<AiConfidence, string> = {
  VERIFIED: "text-olive",
  HIGH_CONFIDENCE_INFERENCE: "text-muted",
  ESTIMATED: "text-terracotta",
  UNKNOWN: "text-terracotta font-semibold",
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
      className={`inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em] ${styles[confidence]}`}
      title={title}
    >
      {confidence === "VERIFIED" ? (
        <span aria-hidden className="text-[0.7rem]">
          ✓
        </span>
      ) : null}
      <span>{confidenceLabel(confidence)}</span>
    </span>
  );
}
