import "server-only";
import { YouTubeAnalyticsError } from "@/lib/youtube-analytics/errors";
import {
  buildWritableVideoSnippet,
  parseYoutubeSnippetReadModel,
  type YoutubeVideoSnippetRecord,
  type WritableYoutubeVideoSnippet,
} from "@/lib/youtube-data/video-snippet-write";

export {
  buildWritableVideoSnippet,
  parseYoutubeSnippetReadModel,
  type WritableYoutubeVideoSnippet,
  type YoutubeVideoSnippetRecord,
  type YoutubeVideoSnippetReadModel,
} from "@/lib/youtube-data/video-snippet-write";

function sanitizeYoutubeApiError(body: unknown): string {
  if (!body || typeof body !== "object") return "YouTube API request failed.";
  const row = body as { error?: { message?: string; errors?: { message?: string }[] } };
  const message = row.error?.message || row.error?.errors?.[0]?.message;
  return message ? String(message).slice(0, 240) : "YouTube API request failed.";
}

export async function fetchYoutubeVideoSnippetOAuth(
  accessToken: string,
  videoId: string,
): Promise<YoutubeVideoSnippetRecord | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoId);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new YouTubeAnalyticsError("api_error", sanitizeYoutubeApiError(body));
  }

  const data = (await response.json()) as {
    items?: Array<{
      id?: string;
      etag?: string;
      snippet?: Record<string, unknown>;
    }>;
    etag?: string;
  };

  const item = data.items?.[0];
  if (!item?.id || !item.snippet) return null;

  return {
    id: item.id,
    etag: item.etag ?? data.etag,
    snippet: parseYoutubeSnippetReadModel(item.snippet),
  };
}

export async function updateYoutubeVideoDescriptionOAuth(input: {
  accessToken: string;
  video: YoutubeVideoSnippetRecord;
  nextDescription: string;
}): Promise<YoutubeVideoSnippetRecord> {
  const writable = buildWritableVideoSnippet(input.video.snippet, input.nextDescription);
  const body = {
    id: input.video.id,
    snippet: writable,
  };

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");

  const response = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new YouTubeAnalyticsError("api_error", sanitizeYoutubeApiError(errorBody));
  }

  const data = (await response.json()) as {
    id?: string;
    etag?: string;
    snippet?: Record<string, unknown>;
  };

  if (!data.id || !data.snippet) {
    throw new YouTubeAnalyticsError("api_error", "YouTube did not return updated video metadata.");
  }

  return {
    id: data.id,
    etag: data.etag,
    snippet: parseYoutubeSnippetReadModel(data.snippet),
  };
}

/** @deprecated Use buildWritableVideoSnippet from video-snippet-write */
export function mergeSnippetDescription(
  current: YoutubeVideoSnippetRecord,
  nextDescription: string,
): WritableYoutubeVideoSnippet {
  return buildWritableVideoSnippet(current.snippet, nextDescription);
}
