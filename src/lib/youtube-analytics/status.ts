/** Distinct outcomes for per-video Analytics loads (never conflate with genuine zeros). */
export type VideoAnalyticsLoadState =
  | "SUCCESS_WITH_DATA"
  | "SUCCESS_NO_DATA"
  | "API_ERROR";

export const VIDEO_ANALYTICS_API_ERROR_NOTICE =
  "Per-video YouTube Analytics could not be loaded. Public YouTube data is still available.";

export const ANALYTICS_FLASH_PARAMS = [
  "analyticsConnected",
  "analyticsNotice",
  "analyticsError",
] as const;

export function parseVideoAnalyticsLoadState(raw: string | null | undefined): VideoAnalyticsLoadState | "" {
  const value = String(raw || "").trim();
  if (value === "SUCCESS_WITH_DATA" || value === "SUCCESS_NO_DATA" || value === "API_ERROR") {
    return value;
  }
  return "";
}
