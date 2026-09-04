/** Below this visitor denominator, show limited-sample messaging and integer rates only. */
export const FUNNEL_LOW_SAMPLE_THRESHOLD = 20;

export type VisitorOutcomeDisplay = {
  fractionLabel: string;
  rateLabel: string | null;
  limitedSample: boolean;
};

export function isFunnelLowSample(denominator: number): boolean {
  return denominator > 0 && denominator < FUNNEL_LOW_SAMPLE_THRESHOLD;
}

/** Visitor-first outcome from recipe-visitor base (parallel outcomes). */
export function formatRecipeVisitorOutcome(
  numerator: number,
  recipeVisitorDenominator: number,
): VisitorOutcomeDisplay {
  const limitedSample = isFunnelLowSample(recipeVisitorDenominator);
  const fractionLabel = `${numerator} of ${recipeVisitorDenominator} visitors`;
  let rateLabel: string | null = null;
  if (recipeVisitorDenominator > 0) {
    const pct = Math.round((numerator / recipeVisitorDenominator) * 100);
    rateLabel = `${pct}%`;
  }
  return { fractionLabel, rateLabel, limitedSample };
}

/** Continued viewing uses video-interaction visitors as denominator, not pageview visitors. */
export function formatContinuedViewingOutcome(
  continuedVisitors: number,
  videoInteractionVisitors: number,
): VisitorOutcomeDisplay & {
  headline: string;
  /** Compact numerator/denominator for stacked display (denominator note shown separately). */
  shortFraction: string | null;
  denominatorNote: string | null;
} {
  const limitedSample = isFunnelLowSample(videoInteractionVisitors);
  const headline = `${continuedVisitors} continued-viewing visitor${continuedVisitors === 1 ? "" : "s"}`;
  const fractionLabel =
    videoInteractionVisitors > 0
      ? `${continuedVisitors} of ${videoInteractionVisitors} video-interacting visitors`
      : `${continuedVisitors} continued-viewing visitors`;
  const shortFraction =
    videoInteractionVisitors > 0
      ? `${continuedVisitors} of ${videoInteractionVisitors}`
      : null;
  const denominatorNote =
    videoInteractionVisitors > 0 ? "video-interacting visitors" : null;
  let rateLabel: string | null = null;
  if (videoInteractionVisitors > 0) {
    const pct = Math.round((continuedVisitors / videoInteractionVisitors) * 100);
    rateLabel = `${pct}%`;
  }
  return {
    headline,
    fractionLabel,
    shortFraction,
    denominatorNote,
    rateLabel,
    limitedSample,
  };
}

export function formatFunnelRateInteger(value: number | null, denominator: number): string {
  if (value === null || !Number.isFinite(value) || denominator <= 0) return "—";
  return `${Math.round(value * 100)}%`;
}

export const FUNNEL_METHODOLOGY = {
  intro:
    "First-party actions on recipe pages with a video. Not YouTube views or subscriptions.",
  lowSampleNotice: (visitorCount: number) =>
    `${visitorCount} unique visitor${visitorCount === 1 ? "" : "s"} in this period. A single visitor can materially change these rates.`,
} as const;

/** Compact one-line limited-sample notice for the Website video panel. */
export function compactLowSampleNotice(visitorCount: number): string {
  return `Limited sample · ${visitorCount} unique visitor${visitorCount === 1 ? "" : "s"} — rates can swing on one person.`;
}

/**
 * Soften zero-over-zero recipe outcome cells only.
 * Never hide real denominators such as "0 of 4 visitors".
 */
export function quietZeroVisitorOutcomeLabel(label: string): string {
  return /^0 of 0\b/.test(label) ? "—" : label;
}

export const FUNNEL_RATE_LABELS = {
  playRate: "Play rate",
  watchOnYoutubeRate: "Watch on YouTube visitor rate",
  subscribeRate: "Subscribe CTA visitor rate",
  continuedRate: "Continued-viewing rate",
} as const;

/** Recipe-table column: intersection of recipe pageview visitors with site-wide multi-video set. */
export const RECIPE_MULTI_VIDEO_VISITORS_LABEL = "Multi-video visitors";

export const RECIPE_MULTI_VIDEO_VISITORS_HELP =
  "Visitors to this recipe who also interacted with at least two distinct Mesa videos during the selected period. This does not necessarily mean the additional interaction occurred directly after this recipe.";

/** Short recipe-table intro line (timing caveat lives in Methodology). */
export const RECIPE_PERFORMANCE_INTRO =
  "Unique visitors are the denominator. Sorted by visitors.";

export const RECIPE_PERFORMANCE_MULTI_VIDEO_NOTE =
  "Multi-video visitors interacted with at least two Mesa videos during the selected period.";

/** Recipe-level multi-video count: X of Y visitors (no rate — not sequential attribution). */
export function formatRecipeMultiVideoVisitorsLabel(
  multiVideoVisitors: number,
  recipeVisitorDenominator: number,
): string {
  return `${multiVideoVisitors} of ${recipeVisitorDenominator} visitors`;
}
