"use client";

import { useEffect } from "react";
import { beginRecipeEngagementSuppression } from "@/lib/recipe-engagement-gate";

/**
 * Mount on Admin Collection preview to suppress public engagement analytics
 * (reuses the same session flag as Recipe Preview).
 */
export function SeriesPreviewEngagementGate({ children }: { children: React.ReactNode }) {
  useEffect(() => beginRecipeEngagementSuppression(), []);
  return children;
}
