"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { publicRecipeId } from "@/lib/recipes";
import {
  RECENTLY_VIEWED_MAX_DISPLAY,
  RECENTLY_VIEWED_MIN_DISPLAY,
  clearRecentlyViewed,
  readRecentlyViewed,
  resolveRecentlyViewedRecipes,
  subscribeRecentlyViewed,
} from "@/lib/recently-viewed";

function recentGridClass(count: number) {
  if (count >= 4) return "grid gap-8 sm:grid-cols-2 lg:grid-cols-4";
  if (count === 3) return "grid gap-8 sm:grid-cols-2 lg:grid-cols-3";
  return "grid gap-8 sm:grid-cols-2";
}

const clearFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

function getServerSnapshot() {
  return "[]";
}

function getClientSnapshot() {
  return JSON.stringify(readRecentlyViewed());
}

/**
 * Homepage shelf for recipes this browser recently opened.
 * Hidden until enough local history exists; pruned against the live catalogue.
 */
export function HomepageRecentlyViewed({ recipes }: { recipes: Recipe[] }) {
  const raw = useSyncExternalStore(
    subscribeRecentlyViewed,
    getClientSnapshot,
    getServerSnapshot,
  );

  const recentRecipes = useMemo(() => {
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
    return resolveRecentlyViewedRecipes(parsed, catalogue, {
      limit: RECENTLY_VIEWED_MAX_DISPLAY,
    });
  }, [raw, recipes]);

  if (recentRecipes.length < RECENTLY_VIEWED_MIN_DISPLAY) return null;

  return (
    <section
      className="border-b border-line bg-cream/40"
      aria-labelledby="recently-viewed-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 id="recently-viewed-heading" className="font-serif text-3xl md:text-4xl">
              Recently viewed
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              Recipes you opened on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={() => clearRecentlyViewed()}
            className={`shrink-0 text-sm font-semibold text-muted hover:text-ink ${clearFocus}`}
          >
            Clear
          </button>
        </div>
        <div className={`${recentGridClass(recentRecipes.length)} items-start`}>
          {recentRecipes.map((recipe) => (
            <RecipeGridCard
              key={publicRecipeId(recipe)}
              recipe={recipe}
              excerptLines={2}
              imageAspect="4/3"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
