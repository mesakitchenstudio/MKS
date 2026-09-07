"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import {
  cookingContentVersion,
  hasMeaningfulCookingProgress,
  readCookingSession,
  resolveCookingSession,
} from "@/lib/cooking-session";
import {
  readRecipeServingsBridge,
  subscribeRecipeServingsBridge,
} from "@/lib/recipe-servings-bridge";
import type { Recipe } from "@/data/types";

function cookHref(slug: string, servings: number, baseServings: number): string {
  const params = new URLSearchParams();
  if (servings !== baseServings) params.set("servings", String(servings));
  const qs = params.toString();
  return `/recipes/${slug}/cook${qs ? `?${qs}` : ""}`;
}

function readEntrySnapshot(
  recipeId: string,
  contentVersion: string,
  recipe: Pick<Recipe, "slug" | "servings">,
): { label: string; href: string } {
  const stored = readCookingSession(recipeId);
  const resolved = resolveCookingSession({ recipeId, contentVersion, stored });
  const continuing =
    resolved.status === "ok" && hasMeaningfulCookingProgress(resolved.session);
  const bridged = readRecipeServingsBridge(recipe.slug);
  // Continue restores cook-session servings; Start hands off the page scaler via bridge.
  const servings = continuing
    ? resolved.session.servings
    : (bridged ?? recipe.servings);
  return {
    label: continuing ? "Continue Cooking" : "Start Cooking",
    href: cookHref(recipe.slug, servings, recipe.servings),
  };
}

/**
 * Lightweight entry CTA — does not load Cooking Mode UI.
 * Reads local/session storage via useSyncExternalStore (no Cooking Mode bundle).
 */
export function RecipeCookEntry({
  recipe,
  recipeId,
}: {
  recipe: Pick<Recipe, "slug" | "instructions" | "ingredients" | "servings" | "title">;
  recipeId: string;
}) {
  const contentVersion = cookingContentVersion(recipe);
  const getSnapshot = useCallback(
    () => readEntrySnapshot(recipeId, contentVersion, recipe),
    [recipeId, contentVersion, recipe],
  );
  const snapshot = useSyncExternalStore(
    subscribeRecipeServingsBridge,
    getSnapshot,
    () => ({ label: "Start Cooking", href: `/recipes/${recipe.slug}/cook` }),
  );

  return (
    <Link
      href={snapshot.href}
      aria-label={`${snapshot.label} — open step-by-step Cooking Mode for ${recipe.title}`}
      className="no-print rounded-full border border-terracotta px-4 py-2.5 text-sm font-semibold text-terracotta hover:bg-terracotta/5"
      data-testid="recipe-cook-entry"
    >
      {snapshot.label}
    </Link>
  );
}
