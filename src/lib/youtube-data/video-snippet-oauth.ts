import "server-only";
import { YouTubeAnalyticsError } from "@/lib/youtube-analytics/errors";

export type YoutubeVideoSnippetRecord = {
  id: string;
  etag?: string;
  snippet: {
    title: string;
    description: string;
    categoryId: string;
    tags?: string[];
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    localized?: { title?: string; description?: string };
    [key: string]: unknown;
  };
};

const WRITABLE_SNIPPET_KEYS = [
  "title",
  "description",
  "categoryId",
  "tags",
  "defaultLanguage",
  "defaultAudioLanguage",
  "localized",
] as const;

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

  const snippet = item.snippet;
  return {
    id: item.id,
    etag: item.etag ?? data.etag,
    snippet: {
      title: String(snippet.title ?? ""),
      description: String(snippet.description ?? ""),
      categoryId: String(snippet.categoryId ?? ""),
      ...(Array.isArray(snippet.tags) ? { tags: snippet.tags.map(String) } : {}),
      ...(snippet.defaultLanguage ? { defaultLanguage: String(snippet.defaultLanguage) } : {}),
      ...(snippet.defaultAudioLanguage
        ? { defaultAudioLanguage: String(snippet.defaultAudioLanguage) }
        : {}),
      ...(snippet.localized && typeof snippet.localized === "object"
        ? { localized: snippet.localized as YoutubeVideoSnippetRecord["snippet"]["localized"] }
        : {}),
    },
  };
}

export function mergeSnippetDescription(
  current: YoutubeVideoSnippetRecord,
  nextDescription: string,
): YoutubeVideoSnippetRecord["snippet"] {
  const merged: Record<string, unknown> = {};
  for (const key of WRITABLE_SNIPPET_KEYS) {
    if (key in current.snippet && current.snippet[key] !== undefined) {
      merged[key] = current.snippet[key];
    }
  }
  merged.description = nextDescription;
  if (!merged.title) merged.title = current.snippet.title;
  if (!merged.categoryId) merged.categoryId = current.snippet.categoryId;
  return merged as YoutubeVideoSnippetRecord["snippet"];
}

export async function updateYoutubeVideoDescriptionOAuth(input: {
  accessToken: string;
  video: YoutubeVideoSnippetRecord;
  nextDescription: string;
}): Promise<YoutubeVideoSnippetRecord> {
  const snippet = mergeSnippetDescription(input.video, input.nextDescription);
  const body = {
    id: input.video.id,
    snippet,
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

  const row = data.snippet;
  return {
    id: data.id,
    etag: data.etag,
    snippet: {
      title: String(row.title ?? snippet.title),
      description: String(row.description ?? input.nextDescription),
      categoryId: String(row.categoryId ?? snippet.categoryId),
      ...(Array.isArray(row.tags)
        ? { tags: row.tags.map(String) }
        : snippet.tags
          ? { tags: snippet.tags }
          : {}),
      ...(row.defaultLanguage ? { defaultLanguage: String(row.defaultLanguage) } : {}),
      ...(row.defaultAudioLanguage
        ? { defaultAudioLanguage: String(row.defaultAudioLanguage) }
        : {}),
    },
  };
}
