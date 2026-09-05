import type { PublicSeriesItem } from "@/lib/series-types";

/** Parse Mesa/YouTube display durations like `7:39` or `1:04:12`. */
export function parseDurationDisplay(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || !Number.isInteger(n))) return null;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

/**
 * Sum durations only when every visible video-bearing item has a parseable duration.
 * Recipe-only items are ignored (they must not invent or zero-fill totals).
 * If any video item lacks a reliable duration, omit the total entirely.
 */
export function seriesVisibleVideoDurationTotalSeconds(
  items: Pick<PublicSeriesItem, "youtubeVideoId" | "watchUrl" | "durationDisplay">[],
): number | null {
  const videoItems = items.filter((item) => Boolean(item.youtubeVideoId || item.watchUrl));
  if (videoItems.length === 0) return null;

  let total = 0;
  for (const item of videoItems) {
    const seconds = parseDurationDisplay(item.durationDisplay);
    if (seconds == null) return null;
    total += seconds;
  }
  return total;
}

/** Sentence-case part count for homepage and restrained public surfaces. */
export function formatSeriesPartCountLabel(itemCount: number): string {
  const count = Math.max(0, Math.floor(itemCount));
  if (count === 1) return "1-part series";
  return `${count}-part series`;
}

/** Quiet editorial metadata, e.g. `2-PART SERIES · 12 MIN TOTAL`. */
export function formatSeriesCollectionMeta(
  items: Pick<PublicSeriesItem, "youtubeVideoId" | "watchUrl" | "durationDisplay">[],
): string {
  const count = items.length;
  const partLabel = count === 1 ? "1-PART SERIES" : `${count}-PART SERIES`;
  const totalSeconds = seriesVisibleVideoDurationTotalSeconds(items);
  if (totalSeconds == null || totalSeconds <= 0) return partLabel;

  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  return `${partLabel} · ${totalMinutes} MIN TOTAL`;
}

/** Shared playlist CTA copy for Series page header + conclusion. */
export const SERIES_PLAYLIST_CTA_LABEL = "Watch the full series on YouTube ↗";
