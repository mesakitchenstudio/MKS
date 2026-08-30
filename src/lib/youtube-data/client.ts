import { formatDurationSeconds, parseIso8601Duration } from "@/lib/youtube-data/duration";
import { YouTubeDataError, mapYouTubeApiError } from "@/lib/youtube-data/errors";
import { youtubeApiKey } from "@/lib/youtube-data/config";
import type { YouTubeApiChannel, YouTubeApiVideo } from "@/lib/youtube-data/types";

const API_BASE = "https://www.googleapis.com/youtube/v3";

type ApiListResponse<T> = {
  items?: T[];
  nextPageToken?: string;
  pageInfo?: { totalResults?: number };
  error?: { message?: string; errors?: { reason?: string }[] };
};

type ChannelItem = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
    country?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
  statistics?: {
    viewCount?: string;
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
  };
};

type PlaylistItemRow = {
  contentDetails?: { videoId?: string };
  snippet?: { publishedAt?: string };
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

function mapChannelItem(item: ChannelItem): YouTubeApiChannel | null {
  if (!item.id) return null;
  return {
    channelId: item.id,
    title: String(item.snippet?.title ?? ""),
    description: String(item.snippet?.description ?? ""),
    customUrl: String(item.snippet?.customUrl ?? ""),
    publishedAt: item.snippet?.publishedAt ?? null,
    thumbnailUrl: pickBestThumbnail(item.snippet?.thumbnails),
    country: String(item.snippet?.country ?? ""),
    uploadsPlaylistId: String(item.contentDetails?.relatedPlaylists?.uploads ?? ""),
    viewCount: String(item.statistics?.viewCount ?? "0"),
    subscriberCount: String(item.statistics?.subscriberCount ?? "0"),
    hiddenSubscriberCount: Boolean(item.statistics?.hiddenSubscriberCount),
    videoCount: String(item.statistics?.videoCount ?? "0"),
  };
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
    thumbnailUrl: pickBestThumbnail(item.snippet?.thumbnails),
    tags: Array.isArray(item.snippet?.tags) ? item.snippet!.tags!.map(String) : [],
    categoryId: String(item.snippet?.categoryId ?? ""),
    durationSeconds,
    durationDisplay: formatDurationSeconds(durationSeconds),
    definition: String(item.contentDetails?.definition ?? ""),
    caption: String(item.contentDetails?.caption ?? ""),
    privacyStatus: String(item.status?.privacyStatus ?? ""),
    embeddable: item.status?.embeddable !== false,
    madeForKids: Boolean(item.status?.madeForKids),
    viewCount: String(item.statistics?.viewCount ?? "0"),
    likeCount: String(item.statistics?.likeCount ?? "0"),
    commentCount: String(item.statistics?.commentCount ?? "0"),
  };
}

async function youtubeApiFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("key", youtubeApiKey());
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), { cache: "no-store" });
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
    throw mapYouTubeApiError(response.status, data.error?.message || text);
  }

  return data;
}

export async function fetchChannelById(channelId: string): Promise<YouTubeApiChannel | null> {
  const data = await youtubeApiFetch<ApiListResponse<ChannelItem>>("/channels", {
    part: "snippet,contentDetails,statistics",
    id: channelId,
  });
  const item = data.items?.[0];
  return item ? mapChannelItem(item) : null;
}

export async function fetchChannelByHandle(handle: string): Promise<YouTubeApiChannel | null> {
  const normalized = handle.replace(/^@/, "");
  const data = await youtubeApiFetch<ApiListResponse<ChannelItem>>("/channels", {
    part: "snippet,contentDetails,statistics",
    forHandle: normalized,
  });
  const item = data.items?.[0];
  return item ? mapChannelItem(item) : null;
}

export async function fetchUploadsPlaylistVideoIds(uploadsPlaylistId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";

  do {
    const data = await youtubeApiFetch<ApiListResponse<PlaylistItemRow>>("/playlistItems", {
      part: "contentDetails,snippet",
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

export async function fetchVideosByIds(videoIds: string[]): Promise<YouTubeApiVideo[]> {
  const results: YouTubeApiVideo[] = [];
  for (let index = 0; index < videoIds.length; index += 50) {
    const batch = videoIds.slice(index, index + 50);
    const data = await youtubeApiFetch<ApiListResponse<VideoItem>>("/videos", {
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

export async function fetchVideo(videoId: string): Promise<YouTubeApiVideo | null> {
  const rows = await fetchVideosByIds([videoId]);
  return rows[0] ?? null;
}

export async function getChannel(): Promise<YouTubeApiChannel | null> {
  const { resolveYoutubeChannelId } = await import("@/lib/youtube-data/config");
  const channelId = await resolveYoutubeChannelId();
  return fetchChannelById(channelId);
}

export async function getUploadedVideoIds(uploadsPlaylistId: string): Promise<string[]> {
  return fetchUploadsPlaylistVideoIds(uploadsPlaylistId);
}
