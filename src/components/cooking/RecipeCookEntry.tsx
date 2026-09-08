"use client";

import Link from "next/link";
import { useCallback, useMemo, useSyncExternalStore } from "react";
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

export type RecipeCookEntrySnapshot = { label: string; href: string };

function cookHref(slug: string, servings: number, baseServings: number): string {
  const params = new URLSearchParams();
  if (servings !== baseServings) params.set("servings", String(servings));
  const qs = params.toString();
  return `/recipes/${slug}/cook${qs ? `?${qs}` : ""}`;
}

export function readEntrySnapshot(
  recipeId: string,
  contentVersion: string,
  recipe: Pick<Recipe, "slug" | "servings">,
): RecipeCookEntrySnapshot {
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
 * Serialize for useSyncExternalStore.
 * Returning a fresh object from getSnapshot() is Object.is-unstable and triggers
 * React #185 (Maximum update depth exceeded). Identical JSON strings are stable.
 */
export function serializeCookEntrySnapshot(snapshot: RecipeCookEntrySnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseCookEntrySnapshot(raw: string): RecipeCookEntrySnapshot {
  try {
    const parsed = JSON.parse(raw) as Partial<RecipeCookEntrySnapshot>;
    if (
      typeof parsed?.label === "string" &&
      typeof parsed?.href === "string" &&
      parsed.label &&
      parsed.href
    ) {
      return { label: parsed.label, href: parsed.href };
    }
  } catch {
    // fall through
  }
  return { label: "Start Cooking", href: "/recipes" };
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
    () => serializeCookEntrySnapshot(readEntrySnapshot(recipeId, contentVersion, recipe)),
    [contentVersion, recipe, recipeId],
  );

  const serverSnapshot = useMemo(
    () =>
      serializeCookEntrySnapshot({
        label: "Start Cooking",
        href: `/recipes/${recipe.slug}/cook`,
      }),
    [recipe.slug],
  );

  const raw = useSyncExternalStore(
    subscribeRecipeServingsBridge,
    getSnapshot,
    () => serverSnapshot,
  );

  const snapshot = useMemo(() => parseCookEntrySnapshot(raw), [raw]);

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
