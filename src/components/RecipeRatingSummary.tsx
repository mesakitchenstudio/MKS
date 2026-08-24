import Link from "next/link";
import { StarRating } from "@/components/StarRating";
import type { RecipeReviewStats } from "@/lib/recipe-reviews";

export function RecipeRatingSummary({ stats }: { stats: RecipeReviewStats }) {
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
