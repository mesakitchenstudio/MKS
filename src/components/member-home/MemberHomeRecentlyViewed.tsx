"use client";

import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { useRecentlyViewedRecipes } from "@/components/useRecentlyViewedRecipes";
import { publicRecipeId } from "@/lib/recipes";
import {
  RECENTLY_VIEWED_MIN_DISPLAY,
  clearRecentlyViewed,
  recentlyViewedGridClass,
} from "@/lib/recently-viewed";

const clearFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/**
 * Member Home shelf for device-local browsing history.
 * Same storage key / Clear semantics as Homepage — not uploaded, not scored.
 * Renders nothing until ≥ RECENTLY_VIEWED_MIN_DISPLAY Published recipes resolve.
 */
export function MemberHomeRecentlyViewed({ recipes }: { recipes: Recipe[] }) {
  const recentRecipes = useRecentlyViewedRecipes(recipes);

  if (recentRecipes.length < RECENTLY_VIEWED_MIN_DISPLAY) return null;

  return (
    <section
      className="mt-8 border-t border-line pt-8"
      aria-labelledby="member-home-recently-viewed"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="member-home-recently-viewed" className="break-words font-serif text-3xl text-ink">
            Recently viewed
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Recipes you opened on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={() => clearRecentlyViewed()}
          aria-label="Clear recently viewed"
          className={`shrink-0 text-sm font-semibold text-muted hover:text-ink ${clearFocus}`}
        >
          Clear
        </button>
      </div>
      <ul
        aria-labelledby="member-home-recently-viewed"
        className={`${recentlyViewedGridClass(recentRecipes.length)} list-none items-start`}
      >
        {recentRecipes.map((recipe) => (
          <li key={publicRecipeId(recipe)} className="min-w-0">
            <RecipeGridCard recipe={recipe} variant="discovery" />
          </li>
        ))}
      </ul>
    </section>
  );
}
