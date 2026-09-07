import type { MemberCurrentMetrics } from "@/lib/content-performance/types";

export function emptyMemberMetrics(): MemberCurrentMetrics {
  return {
    savesCurrent: 0,
    reviewsCurrent: 0,
    averageRating: null,
  };
}

export function memberMetricsFromCounts(input: {
  saves: number;
  reviews: number;
  ratingSum: number;
}): MemberCurrentMetrics {
  return {
    savesCurrent: input.saves,
    reviewsCurrent: input.reviews,
    averageRating:
      input.reviews > 0 ? input.ratingSum / input.reviews : null,
  };
}
