"use client";

import { useEffect } from "react";
import { beginRecipeEngagementSuppression } from "@/lib/recipe-engagement-gate";

/** Mount on Admin recipe preview to suppress public engagement analytics. */
export function RecipePreviewEngagementGate({ children }: { children: React.ReactNode }) {
  useEffect(() => beginRecipeEngagementSuppression(), []);
  return children;
}
