import { formatAdminDateTimeUtc } from "@/lib/datetime";
import {
  classifyYouTubeVideoFormat,
  youtubeVideoFormatLabel,
  type YouTubeVideoFormat,
} from "@/lib/youtube-data/video-format";

export type ScheduledVideoStatusLabel =
  | "Scheduled"
  | "Published"
  | "Private"
  | "Unlisted"
  | "Processing"
  | "Unavailable";

export type ScheduledVideoRow = {
  videoId: string;
  youtubeTitle: string;
  displayTitle: string;
  /** True when displayTitle is editorial and YouTube title should show secondarily. */
  showYoutubeTitle: boolean;
  thumbnailUrl: string;
  format: YouTubeVideoFormat;
  formatLabel: string;
  scheduledPublishAt: Date;
  scheduledDateLabel: string;
  scheduledTimeLabel: string;
  timezoneLabel: string;
  localTimeLabel: string;
  localTimezoneLabel: string;
  statusLabel: ScheduledVideoStatusLabel;
  privacyStatus: string;
  uploadStatus: string;
  recipe: { id: string; slug: string; title: string } | null;
  seriesTitle: string | null;
  studioUrl: string;
};

export type YoutubeScheduleDashboard = {
  status: "ok" | "error" | "needs_oauth";
  errorMessage: string;
  lastSyncedAt: Date | null;
  lastSyncedLabel: string;
  analyticsConnected: boolean;
  nextUp: ScheduledVideoRow | null;
  upcoming: ScheduledVideoRow[];
};

export function isFutureScheduledPublishAt(
  value: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > now.getTime();
}

export function scheduledVideoStatusLabel(input: {
  scheduledPublishAt: Date | null;
  privacyStatus?: string | null;
  uploadStatus?: string | null;
  now?: Date;
}): ScheduledVideoStatusLabel {
  const now = input.now ?? new Date();
  const upload = String(input.uploadStatus || "").trim().toLowerCase();
  if (upload === "processing") return "Processing";
  if (upload === "rejected" || upload === "failed") return "Unavailable";

  if (isFutureScheduledPublishAt(input.scheduledPublishAt, now)) return "Scheduled";

  const privacy = String(input.privacyStatus || "").trim().toLowerCase();
  if (privacy === "public") return "Published";
  if (privacy === "unlisted") return "Unlisted";
  if (privacy === "private") return "Private";
  return "Unavailable";
}

export type YoutubeCalendarClassification = {
  status: "PUBLISHED" | "SCHEDULED";
  releaseAt: Date;
};

/**
 * Authoritative Schedule calendar classification from YouTube status fields.
 * Does NOT treat snippet.publishedAt alone as “Published”.
 *
 * - public → Published (releaseAt = publishedAt when valid)
 * - private + future publishAt → Scheduled
 * - private/unlisted unscheduled, failed uploads, private+past publishAt → excluded
 */
export function classifyYoutubeCalendarEntry(input: {
  privacyStatus?: string | null;
  uploadStatus?: string | null;
  scheduledPublishAt?: Date | string | null;
  publishedAt?: Date | string | null;
  now?: Date;
}): YoutubeCalendarClassification | null {
  const now = input.now ?? new Date();
  const upload = String(input.uploadStatus || "").trim().toLowerCase();
  if (upload === "rejected" || upload === "failed" || upload === "deleted") {
    return null;
  }

  const privacy = String(input.privacyStatus || "").trim().toLowerCase();

  if (privacy === "public") {
    const publishedAt = toValidDate(input.publishedAt);
    if (publishedAt) return { status: "PUBLISHED", releaseAt: publishedAt };
    // Public without a usable publishedAt is rare; still calendar-visible using now.
    return { status: "PUBLISHED", releaseAt: now };
  }

  if (privacy === "private" && isFutureScheduledPublishAt(input.scheduledPublishAt, now)) {
    const scheduledAt = toValidDate(input.scheduledPublishAt);
    if (!scheduledAt) return null;
    return { status: "SCHEDULED", releaseAt: scheduledAt };
  }

  // private unscheduled, private+past publishAt, unlisted, unknown → not on calendar
  return null;
}

function toValidDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Split UTC scheduled time for editorial layout (GMT + Europe/Istanbul). */
export function formatScheduledPublishParts(
  value: Date | string | null | undefined,
): {
  dateLabel: string;
  timeLabel: string;
  timezoneLabel: string;
  localTimeLabel: string;
  localTimezoneLabel: string;
} {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return {
      dateLabel: "—",
      timeLabel: "—",
      timezoneLabel: "GMT",
      localTimeLabel: "—",
      localTimezoneLabel: "Istanbul",
    };
  }

  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const time = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
  const localTime = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/Istanbul",
  });

  return {
    dateLabel: `${month} ${day}, ${year}`,
    timeLabel: time,
    timezoneLabel: "GMT",
    localTimeLabel: localTime,
    localTimezoneLabel: "Istanbul",
  };
}

/**
 * Prefer linked recipe editorial identity (dishName via resolveRecipeCardTitle in the index).
 * Fall back to the raw YouTube title. Do not invent a second resolver.
 */
export function resolveScheduledVideoTitles(input: {
  youtubeTitle: string;
  linkedRecipeTitle?: string | null;
}): { displayTitle: string; showYoutubeTitle: boolean } {
  const youtubeTitle = String(input.youtubeTitle || "").trim();
  const editorial = String(input.linkedRecipeTitle || "").trim();
  if (editorial) {
    const same =
      editorial.localeCompare(youtubeTitle, undefined, { sensitivity: "accent" }) === 0;
    return {
      displayTitle: editorial,
      showYoutubeTitle: Boolean(youtubeTitle) && !same,
    };
  }
  return {
    displayTitle: youtubeTitle || "Untitled video",
    showYoutubeTitle: false,
  };
}

/** Persist only future YouTube publishAt values; past/missing clear the schedule field. */
export function coalesceScheduledPublishAt(
  value: string | Date | null | undefined,
  now = new Date(),
): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() <= now.getTime()) return null;
  return date;
}

export function youtubeStudioVideoUrl(videoId: string): string {
  return `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/edit`;
}

export function scheduleFormatLabel(format: YouTubeVideoFormat): string {
  switch (format) {
    case "SHORT":
      return "SHORT";
    case "LONG":
      return "LONG-FORM";
    case "UNKNOWN":
      return youtubeVideoFormatLabel(format).toUpperCase();
  }
}

export function selectUpcomingScheduledVideos<T extends { scheduledPublishAt: Date }>(
  rows: T[],
  now = new Date(),
): T[] {
  return rows
    .filter((row) => isFutureScheduledPublishAt(row.scheduledPublishAt, now))
    .sort((a, b) => a.scheduledPublishAt.getTime() - b.scheduledPublishAt.getTime());
}

export function selectNextUpScheduledVideo<T extends { scheduledPublishAt: Date }>(
  upcoming: T[],
): T | null {
  return upcoming[0] ?? null;
}

export function formatScheduleLastSyncedLabel(value: Date | string | null | undefined) {
  return value ? formatAdminDateTimeUtc(value) : "Never";
}

export function parseVideoTagsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function classifyScheduledVideoFormat(input: {
  title: string;
  description: string;
  tags: string[];
  durationSeconds: number;
}): YouTubeVideoFormat {
  return classifyYouTubeVideoFormat(input);
}
