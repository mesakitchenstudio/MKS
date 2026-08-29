"use client";

import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { adminFocusRing, adminPrimaryButtonClass } from "@/lib/admin-ui";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function AiDraftReviewSummary({
  meta,
  onReviewEstimated,
  onMarkVerified,
  onDownloadJson,
}: {
  meta: RecipeAiMeta;
  onReviewEstimated: () => void;
  onMarkVerified?: () => void;
  onDownloadJson?: () => void;
}) {
  const unverified = meta.verificationStatus !== "verified";

  return (
    <div className="rounded-sm border border-olive/25 bg-olive/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            {unverified ? "AI draft generated — not verified" : "AI draft — verified"}
          </p>
          <p className="mt-1 text-xs text-muted">
            Verified: {meta.summary.verified} · Inferred: {meta.summary.inferred} · Estimated:{" "}
            {meta.summary.estimated} · Needs input: {meta.summary.unknown}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={onReviewEstimated}>
            Review estimated fields
          </button>
          {unverified && onMarkVerified ? (
            <button
              type="button"
              className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
              onClick={onMarkVerified}
            >
              Mark recipe verified
            </button>
          ) : null}
          {onDownloadJson ? (
            <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={onDownloadJson}>
              Download AI JSON
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
