import "server-only";
import { formatDurationSeconds, parseIso8601Duration } from "@/lib/youtube-data/duration";
import { YouTubeDataError } from "@/lib/youtube-data/errors";
import type { YouTubeApiVideo } from "@/lib/youtube-data/types";

const API_BASE = "https://www.googleapis.com/youtube/v3";

type ApiListResponse<T> = {
  items?: T[];
  nextPageToken?: string;
  error?: { message?: string };
};

type VideoItem = {
  id?: string;
  snippet?: {
    channelId?: string;
    title?: string;
    description?: string;
    publishedAt?: string;
    tags?: string[];
    categoryId?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
  contentDetails?: {
    duration?: string;
    definition?: string;
    caption?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  status?: {
    privacyStatus?: string;
    uploadStatus?: string;
    publishAt?: string;
    embeddable?: boolean;
    madeForKids?: boolean;
  };
};

function pickBestThumbnail(thumbnails?: Record<string, { url?: string }>): string {
  if (!thumbnails) return "";
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    ""
  );
}

function mapVideoItem(item: VideoItem): YouTubeApiVideo | null {
  if (!item.id) return null;
  const durationSeconds = item.contentDetails?.duration
    ? parseIso8601Duration(item.contentDetails.duration) ?? 0
    : 0;
  return {
    videoId: item.id,
    channelId: String(item.snippet?.channelId ?? ""),
    title: String(item.snippet?.title ?? ""),
    description: String(item.snippet?.description ?? ""),
    publishedAt: item.snippet?.publishedAt ?? null,
    scheduledPublishAt: item.status?.publishAt ?? null,
    thumbnailUrl: pickBestThumbnail(item.snippet?.thumbnails),
    tags: Array.isArray(item.snippet?.tags) ? item.snippet!.tags!.map(String) : [],
    categoryId: String(item.snippet?.categoryId ?? ""),
    durationSeconds,
    durationDisplay: formatDurationSeconds(durationSeconds),
    definition: String(item.contentDetails?.definition ?? ""),
    caption: String(item.contentDetails?.caption ?? ""),
    privacyStatus: String(item.status?.privacyStatus ?? ""),
    uploadStatus: String(item.status?.uploadStatus ?? ""),
    embeddable: item.status?.embeddable !== false,
    madeForKids: Boolean(item.status?.madeForKids),
    viewCount: String(item.statistics?.viewCount ?? "0"),
    likeCount: String(item.statistics?.likeCount ?? "0"),
    commentCount: String(item.statistics?.commentCount ?? "0"),
  };
}

async function youtubeOAuthFetch<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    throw new YouTubeDataError("network_failure", "Could not reach the YouTube Data API.");
  }

  const text = await response.text();
  let data: T & { error?: { message?: string } };
  try {
    data = JSON.parse(text) as T & { error?: { message?: string } };
  } catch {
    throw new YouTubeDataError("api_error", "YouTube API returned an unreadable response.", response.status);
  }

  if (!response.ok) {
    throw new YouTubeDataError(
      "api_error",
      data.error?.message || "YouTube OAuth request failed.",
      response.status,
    );
  }

  return data;
}

/** Channel-owner uploads playlist includes private/scheduled videos. */
export async function fetchUploadsPlaylistVideoIdsOAuth(
  accessToken: string,
  uploadsPlaylistId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";

  do {
    const data = await youtubeOAuthFetch<
      ApiListResponse<{ contentDetails?: { videoId?: string } }>
    >(accessToken, "/playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (videoId) ids.push(videoId);
    }
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  return ids;
}

export async function fetchVideosByIdsOAuth(
  accessToken: string,
  videoIds: string[],
): Promise<YouTubeApiVideo[]> {
  const results: YouTubeApiVideo[] = [];
  for (let index = 0; index < videoIds.length; index += 50) {
    const batch = videoIds.slice(index, index + 50);
    const data = await youtubeOAuthFetch<ApiListResponse<VideoItem>>(accessToken, "/videos", {
      part: "snippet,contentDetails,statistics,status",
      id: batch.join(","),
    });
    for (const item of data.items ?? []) {
      const mapped = mapVideoItem(item);
      if (mapped) results.push(mapped);
    }
  }
  return results;
}
