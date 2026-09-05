/**
 * YouTube video format classification for Mesa admin analytics and public /videos.
 * Calculated from synced metadata — not an authoritative YouTube API "isShort" field.
 */

export const YOUTUBE_VIDEO_FORMATS = ["SHORT", "LONG", "UNKNOWN"] as const;
export type YouTubeVideoFormat = (typeof YOUTUBE_VIDEO_FORMATS)[number];

/** YouTube Shorts max length (current platform limit). */
export const YOUTUBE_SHORTS_MAX_SECONDS = 3 * 60;

/**
 * Classic Shorts shelf threshold. Duration alone is a high-confidence Short signal
 * when no stronger LONG evidence exists.
 */
export const YOUTUBE_SHORTS_CLASSIC_MAX_SECONDS = 60;

/**
 * Cautious duration-only fallback for short-form clips that omit #shorts markers.
 * Kept well below the 180s platform max to avoid mistaking mid-length tips as Shorts.
 */
export const YOUTUBE_SHORTS_DURATION_FALLBACK_MAX_SECONDS = 90;

export type YouTubeVideoFormatInput = {
  /** Optional pre-stored format from sync (future-proof). */
  videoFormat?: string | null;
  title?: string | null;
  description?: string | null;
  tags?: string[] | string | null;
  durationSeconds?: number | null;
  /** Any known watch / shorts / canonical URL. */
  url?: string | null;
  watchUrl?: string | null;
};

export function parseYouTubeVideoFormat(value: unknown): YouTubeVideoFormat | null {
  const upper = String(value ?? "")
    .trim()
    .toUpperCase();
  if (upper === "SHORT" || upper === "LONG" || upper === "UNKNOWN") return upper;
  return null;
}

export function youtubeVideoFormatLabel(format: YouTubeVideoFormat): string {
  switch (format) {
    case "SHORT":
      return "Short";
    case "LONG":
      return "Long";
    case "UNKNOWN":
      return "Unknown";
  }
}

function normalizeTags(tags: YouTubeVideoFormatInput["tags"]): string[] {
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === "string") {
    try {
      const parsed = JSON.parse(tags) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // plain comma list
      return tags
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function textHasShortsMarker(value: string): boolean {
  return /#shorts\b/i.test(value) || /\bshorts\b/i.test(value);
}

function urlsIndicateShort(input: YouTubeVideoFormatInput): boolean {
  const candidates = [input.url, input.watchUrl].filter(Boolean).map(String);
  return candidates.some((url) => /youtube\.com\/shorts\//i.test(url) || /youtu\.be\/shorts\//i.test(url));
}

function hasShortsHashtagEvidence(input: YouTubeVideoFormatInput): boolean {
  const title = String(input.title ?? "");
  const description = String(input.description ?? "");
  if (textHasShortsMarker(title) || /#shorts\b/i.test(description)) return true;
  return normalizeTags(input.tags).some((tag) => /^(#)?shorts$/i.test(tag.trim()));
}

/**
 * Soft title signal: standalone "short" (not shortbread / shortcake / etc.).
 * Used only with a Shorts-length duration cap.
 */
export function titleHasSoftShortSignal(title: string): boolean {
  const value = String(title ?? "");
  if (
    /\bshortbread\b|\bshortcake\b|\bshortcrust\b|\bshortcut\b|\bshortage\b|\bshortly\b|\bshorten(?:ed|ing|s)?\b/i.test(
      value,
    )
  ) {
    return false;
  }
  return /\bshort\b/i.test(value);
}

/**
 * Classify a synced YouTube video as SHORT, LONG, or UNKNOWN.
 *
 * Evidence hierarchy:
 * 1. Stored/manual `videoFormat` override (SHORT | LONG)
 * 2. YouTube `/shorts/` URL
 * 3. `#shorts` / `shorts` title, description, or tag evidence (≤180s)
 * 4. Soft title "short" word (≤180s), excluding food/common false positives
 * 5. Duration > 180s → LONG
 * 6. Duration-only fallback: ≤60s (classic) or ≤90s (cautious) → SHORT
 * 7. Otherwise UNKNOWN (e.g. 91–180s with no Shorts markers)
 */
export function classifyYouTubeVideoFormat(video: YouTubeVideoFormatInput): YouTubeVideoFormat {
  const stored = parseYouTubeVideoFormat(video.videoFormat);
  if (stored === "SHORT" || stored === "LONG") return stored;

  if (urlsIndicateShort(video)) return "SHORT";

  const duration =
    typeof video.durationSeconds === "number" && Number.isFinite(video.durationSeconds)
      ? Math.max(0, Math.floor(video.durationSeconds))
      : 0;

  const shortsSignal = hasShortsHashtagEvidence(video);
  if (shortsSignal && (duration === 0 || duration <= YOUTUBE_SHORTS_MAX_SECONDS)) {
    return "SHORT";
  }

  if (
    titleHasSoftShortSignal(String(video.title ?? "")) &&
    (duration === 0 || duration <= YOUTUBE_SHORTS_MAX_SECONDS)
  ) {
    return "SHORT";
  }

  if (duration > YOUTUBE_SHORTS_MAX_SECONDS) return "LONG";

  if (duration > 0 && duration <= YOUTUBE_SHORTS_CLASSIC_MAX_SECONDS) {
    return "SHORT";
  }

  if (duration > 0 && duration <= YOUTUBE_SHORTS_DURATION_FALLBACK_MAX_SECONDS) {
    return "SHORT";
  }

  if (stored === "UNKNOWN") return "UNKNOWN";

  // 91–180s (or unknown duration) without Shorts evidence.
  return "UNKNOWN";
}

export type YoutubeDashboardVideoFilter =
  | "all"
  | "long"
  | "shorts"
  | "needs"
  | "linked"
  | "opportunities"
  | "missing-chapters"
  | "metadata";

export function parseYoutubeDashboardFilter(value: unknown): YoutubeDashboardVideoFilter {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "long" || raw === "long-videos") return "long";
  if (raw === "shorts" || raw === "short") return "shorts";
  if (raw === "needs" || raw === "needs-recipe") return "needs";
  if (raw === "linked" || raw === "linked-to-recipe") return "linked";
  if (raw === "opportunities" || raw === "opportunity") return "opportunities";
  if (raw === "missing-chapters" || raw === "chapters") return "missing-chapters";
  if (raw === "metadata" || raw === "metadata-issues") return "metadata";
  return "all";
}

export function youtubeDashboardFilterQueryValue(
  filter: YoutubeDashboardVideoFilter,
): string | null {
  switch (filter) {
    case "all":
      return null;
    case "long":
      return "long";
    case "shorts":
      return "shorts";
    case "needs":
      return "needs-recipe";
    case "linked":
      return "linked";
    case "opportunities":
      return "opportunities";
    case "missing-chapters":
      return "missing-chapters";
    case "metadata":
      return "metadata";
  }
}
