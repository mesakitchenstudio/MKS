"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StarRating } from "@/components/StarRating";
import { fetchRecipeReviewData } from "@/lib/recipe-reviews-client";
import type { RecipeReviewStats } from "@/lib/recipe-reviews";

export function RecipeRatingSummary({
  slug,
  initial,
}: {
  slug: string;
  initial: RecipeReviewStats;
}) {
  const [stats, setStats] = useState(initial);

  useEffect(() => {
    setStats(initial);
  }, [initial]);

  useEffect(() => {
    let active = true;
    void fetchRecipeReviewData(slug)
      .then((data) => {
        if (active) setStats(data.stats);
      })
      .catch(() => {
        /* keep server fallback */
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    function onUpdated(event: Event) {
      const detail = (event as CustomEvent<RecipeReviewStats>).detail;
      if (detail) setStats(detail);
    }
    window.addEventListener("recipe-reviews-updated", onUpdated);
    return () => window.removeEventListener("recipe-reviews-updated", onUpdated);
  }, []);

  if (!stats.count) {
    return (
      <p className="mt-4 text-sm text-muted">
        <Link href="#recipe-comments" className="font-semibold text-terracotta hover:underline">
          Be the first to rate this recipe
        </Link>
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <StarRating value={stats.average} size="sm" label={`${stats.average} out of 5 stars`} />
      <p className="flex items-center gap-2 text-sm leading-none text-muted">
        <span className="font-serif text-xl font-semibold text-ink">
          {stats.average.toFixed(1)}
        </span>
        <span>from {stats.count} {stats.count === 1 ? "review" : "reviews"}</span>
      </p>
      <Link
        href="#recipe-comments"
        className="text-sm font-semibold leading-none text-terracotta hover:underline"
      >
        Read reviews
      </Link>
    </div>
  );
}

export function notifyRecipeReviewsUpdated(stats: RecipeReviewStats) {
  window.dispatchEvent(new CustomEvent("recipe-reviews-updated", { detail: stats }));
}
