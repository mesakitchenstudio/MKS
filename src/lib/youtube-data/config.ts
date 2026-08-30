import { getDb } from "@/lib/db";
import { YouTubeDataError } from "@/lib/youtube-data/errors";
import { fetchChannelByHandle, fetchChannelById } from "@/lib/youtube-data/client";

const DEFAULT_HANDLE = "mesakitchenstudio";

export function youtubeApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) {
    throw new YouTubeDataError(
      "missing_api_key",
      "YOUTUBE_API_KEY is not configured on the server.",
    );
  }
  return key;
}

export function configuredYoutubeChannelId(): string | null {
  return process.env.YOUTUBE_CHANNEL_ID?.trim() || null;
}

export function configuredYoutubeChannelHandle(): string {
  return process.env.YOUTUBE_CHANNEL_HANDLE?.trim() || DEFAULT_HANDLE;
}

/** Resolve stable channel ID from env or DB cache; one-time handle lookup when needed. */
export async function resolveYoutubeChannelId(): Promise<string> {
  const fromEnv = configuredYoutubeChannelId();
  if (fromEnv) return fromEnv;

  const db = getDb();
  const cached = await db.youTubeChannel.findFirst({ orderBy: { lastSyncedAt: "desc" } });
  if (cached?.channelId) return cached.channelId;

  const handle = configuredYoutubeChannelHandle();
  const channel = await fetchChannelByHandle(handle);
  if (!channel) {
    throw new YouTubeDataError(
      "missing_channel_id",
      `Could not resolve YouTube channel for handle @${handle}. Set YOUTUBE_CHANNEL_ID in environment variables.`,
    );
  }
  return channel.channelId;
}

export async function getStoredYoutubeChannelId(): Promise<string | null> {
  if (configuredYoutubeChannelId()) return configuredYoutubeChannelId();
  const db = getDb();
  const cached = await db.youTubeChannel.findFirst({ orderBy: { lastSyncedAt: "desc" } });
  return cached?.channelId ?? null;
}

export async function assertChannelConfigured(): Promise<string> {
  try {
    return await resolveYoutubeChannelId();
  } catch (error) {
    if (error instanceof YouTubeDataError && error.code === "missing_channel_id") {
      throw error;
    }
    throw error;
  }
}

export async function prefetchChannelIdFromHandle(): Promise<string> {
  const existing = await getStoredYoutubeChannelId();
  if (existing) return existing;
  const handle = configuredYoutubeChannelHandle();
  const row = await fetchChannelByHandle(handle);
  if (!row) {
    throw new YouTubeDataError("channel_unavailable", `YouTube channel @${handle} was not found.`);
  }
  return row.channelId;
}

export async function validateChannelId(channelId: string): Promise<boolean> {
  const channel = await fetchChannelById(channelId);
  return Boolean(channel);
}
