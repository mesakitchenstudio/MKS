import {
  formatSearchConsoleCtr,
  formatSearchConsolePosition,
} from "@/lib/search-console/aggregate";
import {
  formatAverageViewDuration,
  formatWatchTimeHours,
} from "@/lib/youtube-analytics/aggregate";
import type { MetricAvailability } from "@/lib/content-performance/types";

export function formatMetricNumber(value: number | null, availability: MetricAvailability): string {
  if (availability === "not_connected") return "Not connected";
  if (availability === "unavailable") return "No data";
  if (value === null) return "—";
  return Math.round(value).toLocaleString("en-US");
}

export function formatMetricCtr(value: number | null, availability: MetricAvailability): string {
  if (availability === "not_connected") return "Not connected";
  if (availability === "unavailable") return "No data";
  if (value === null) return "—";
  return formatSearchConsoleCtr(value);
}

export function formatMetricPosition(
  value: number | null,
  availability: MetricAvailability,
): string {
  if (availability === "not_connected") return "Not connected";
  if (availability === "unavailable") return "No data";
  if (value === null || value <= 0) return "—";
  return formatSearchConsolePosition(value);
}

export function formatYoutubeViews(value: number | null, availability: MetricAvailability): string {
  return formatMetricNumber(value, availability);
}

export function formatYoutubeWatchTime(
  minutes: number | null,
  availability: MetricAvailability,
): string {
  if (availability === "not_connected") return "Not connected";
  if (availability === "unavailable" || minutes === null) return "—";
  return formatWatchTimeHours(minutes);
}

export function formatYoutubeAvd(
  seconds: number | null,
  availability: MetricAvailability,
): string {
  if (availability === "not_connected") return "Not connected";
  if (availability === "unavailable" || seconds === null) return "—";
  return formatAverageViewDuration(seconds);
}

export { formatSearchConsoleCtr, formatSearchConsolePosition };
