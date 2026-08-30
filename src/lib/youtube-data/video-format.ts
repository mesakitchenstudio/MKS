/**
 * YouTube video format classification for Mesa admin analytics.
 * Calculated from synced metadata — not an authoritative YouTube API "isShort" field.
 */

export const YOUTUBE_VIDEO_FORMATS = ["SHORT", "LONG", "UNKNOWN"] as const;
export type YouTubeVideoFormat = (typeof YOUTUBE_VIDEO_FORMATS)[number];

/** YouTube Shorts max length (current platform limit). */
export const YOUTUBE_SHORTS_MAX_SECONDS = 3 * 60;

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
 * Classify a synced YouTube video as SHORT, LONG, or UNKNOWN.
 * Conservative: prefers explicit Shorts signals; does not invent certainty for
 * short-duration videos without supporting evidence.
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

  if (duration > YOUTUBE_SHORTS_MAX_SECONDS) return "LONG";

  if (stored === "UNKNOWN") return "UNKNOWN";

  // <= 3 minutes (or unknown duration) without strong Shorts evidence.
  return "UNKNOWN";
}

export type YoutubeDashboardVideoFilter =
  | "all"
  | "long"
  | "shorts"
  | "needs"
  | "linked";

export function parseYoutubeDashboardFilter(value: unknown): YoutubeDashboardVideoFilter {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "long" || raw === "long-videos") return "long";
  if (raw === "shorts" || raw === "short") return "shorts";
  if (raw === "needs" || raw === "needs-recipe") return "needs";
  if (raw === "linked" || raw === "linked-to-recipe") return "linked";
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
  }
}
