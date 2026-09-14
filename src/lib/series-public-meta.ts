import type { PublicSeriesItem } from "@/lib/series-types";
import {
  formatCollectionContentCount,
  formatCollectionMetaLine,
} from "@/lib/series-collection-count";

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

/** Sentence-case part count for restrained public surfaces. */
export function formatSeriesPartCountLabel(itemCount: number): string {
  const count = Math.max(0, Math.floor(itemCount));
  if (count === 1) return "1 item";
  return `${count} items`;
}

/**
 * Homepage Featured Collection metadata.
 * Composition-aware: recipes / videos / items.
 */
export function formatHomepageSeriesMetaLabel(input: {
  recipeCount: number;
  videoCount: number;
  itemCount: number;
}): string {
  const base = formatCollectionContentCount(input);
  if (!base) return "";
  if (input.videoCount > 0 && input.recipeCount > 0) return `${base} · video guides`;
  if (input.videoCount > 0 && input.recipeCount === 0) return base;
  return base;
}

/** Quiet editorial metadata, e.g. `4 RECIPES · 12 MIN TOTAL`. */
export function formatSeriesCollectionMeta(
  items: Pick<
    PublicSeriesItem,
    "youtubeVideoId" | "watchUrl" | "durationDisplay" | "recipeSlug"
  >[],
): string {
  const recipeCount = items.filter((item) => Boolean(item.recipeSlug)).length;
  const videoCount = items.filter((item) => Boolean(item.youtubeVideoId || item.watchUrl)).length;
  const countLabel = formatCollectionContentCount({
    recipeCount,
    videoCount,
    itemCount: items.length,
  });
  const totalSeconds = seriesVisibleVideoDurationTotalSeconds(items);
  const totalMinutes =
    totalSeconds != null && totalSeconds > 0 ? Math.max(1, Math.round(totalSeconds / 60)) : null;
  return formatCollectionMetaLine(countLabel, totalMinutes);
}

/** Shared playlist CTA copy for Collection page header + conclusion. */
export const SERIES_PLAYLIST_CTA_LABEL = "Watch playlist on YouTube ↗";
