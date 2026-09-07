import type { MetricAvailability, WebsitePeriodMetrics } from "@/lib/content-performance/types";

export type WebsitePathBucket = {
  path: string;
  pageViews: number;
  uniqueVisitors: number;
};

export function emptyWebsiteMetrics(availability: MetricAvailability): WebsitePeriodMetrics {
  return {
    pageViews: availability === "zero" ? 0 : null,
    uniqueVisitors: availability === "zero" ? 0 : null,
    availability,
    contributingPaths: [],
  };
}

export function aggregateWebsiteFromBuckets(
  buckets: WebsitePathBucket[],
): WebsitePeriodMetrics {
  if (buckets.length === 0) {
    return emptyWebsiteMetrics("zero");
  }
  let pageViews = 0;
  // uniqueVisitors across paths cannot simply sum path uniques (overlap).
  // Callers that have visitor sets should use aggregateWebsiteFromVisitorSets.
  for (const bucket of buckets) {
    pageViews += bucket.pageViews;
  }
  const uniqueSum = buckets.reduce((sum, b) => sum + b.uniqueVisitors, 0);
  return {
    pageViews,
    // When merging multiple paths without shared visitor sets, path-unique sums
    // over-count. Prefer aggregateWebsiteFromVisitorSets in the loader.
    uniqueVisitors: buckets.length === 1 ? uniqueSum : null,
    availability: "available",
    contributingPaths: buckets.map((b) => b.path).sort((a, b) => a.localeCompare(b)),
  };
}

export function aggregateWebsiteFromVisitorSets(input: {
  paths: string[];
  pageViews: number;
  visitorIds: Set<string>;
}): WebsitePeriodMetrics {
  if (input.pageViews <= 0 && input.visitorIds.size === 0) {
    return emptyWebsiteMetrics("zero");
  }
  return {
    pageViews: input.pageViews,
    uniqueVisitors: input.visitorIds.size,
    availability: "available",
    contributingPaths: [...input.paths].sort((a, b) => a.localeCompare(b)),
  };
}
