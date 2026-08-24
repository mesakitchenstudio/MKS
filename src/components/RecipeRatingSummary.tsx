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
      <StarRating value={stats.average} label={`${stats.average} out of 5 stars`} />
      <p className="text-base text-ink">
        <span className="font-serif text-2xl font-semibold">{stats.average.toFixed(1)}</span>
        <span className="text-muted">
          {" "}
          from {stats.count} {stats.count === 1 ? "review" : "reviews"}
        </span>
      </p>
      <Link
        href="#recipe-comments"
        className="text-sm font-semibold text-terracotta hover:underline"
      >
        Read reviews
      </Link>
    </div>
  );
}
