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
  thumbnailUrl: string;
  format: YouTubeVideoFormat;
  formatLabel: string;
  scheduledPublishAt: Date;
  scheduledDateLabel: string;
  scheduledTimeLabel: string;
  timezoneLabel: string;
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

/** Split UTC scheduled time for editorial layout (date + time + GMT). */
export function formatScheduledPublishParts(
  value: Date | string | null | undefined,
): { dateLabel: string; timeLabel: string; timezoneLabel: string } {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { dateLabel: "—", timeLabel: "—", timezoneLabel: "GMT" };
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

  return {
    dateLabel: `${month} ${day}, ${year}`,
    timeLabel: time,
    timezoneLabel: "GMT",
  };
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
