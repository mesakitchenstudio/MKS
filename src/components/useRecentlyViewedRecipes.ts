"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Recipe } from "@/data/types";
import { publicRecipeId } from "@/lib/recipes";
import {
  RECENTLY_VIEWED_MAX_DISPLAY,
  readRecentlyViewed,
  resolveRecentlyViewedRecipes,
  subscribeRecentlyViewed,
} from "@/lib/recently-viewed";

function getServerSnapshot() {
  return "[]";
}

function getClientSnapshot() {
  return JSON.stringify(readRecentlyViewed());
}

/**
 * Shared client hook for Homepage, Search, and Member Home.
 * Server snapshot is always empty — avoids hydration mismatch.
 * Presentation fields come from the live Published catalogue, not localStorage titles/images.
 */
export function useRecentlyViewedRecipes(
  recipes: Recipe[],
  options?: { limit?: number },
): Recipe[] {
  const limit = options?.limit ?? RECENTLY_VIEWED_MAX_DISPLAY;
  const raw = useSyncExternalStore(
    subscribeRecentlyViewed,
    getClientSnapshot,
    getServerSnapshot,
  );

  return useMemo(() => {
    let parsed: ReturnType<typeof readRecentlyViewed> = [];
    try {
      parsed = JSON.parse(raw) as ReturnType<typeof readRecentlyViewed>;
    } catch {
      parsed = [];
    }
    const catalogue = recipes.map((recipe) => ({
      ...recipe,
      id: publicRecipeId(recipe),
    }));
    return resolveRecentlyViewedRecipes(parsed, catalogue, { limit });
  }, [raw, recipes, limit]);
}
