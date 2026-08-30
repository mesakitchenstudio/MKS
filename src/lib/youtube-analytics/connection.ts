import "server-only";
import { getDb } from "@/lib/db";
import { openSecret, sealSecret } from "@/lib/youtube-analytics/crypto";
import { YouTubeAnalyticsError } from "@/lib/youtube-analytics/errors";
import {
  fetchGoogleAccountEmail,
  fetchMineYoutubeChannel,
  refreshAccessToken,
  revokeGoogleToken,
  YT_ANALYTICS_SCOPES,
} from "@/lib/youtube-analytics/oauth";
import { resolveYoutubeChannelId } from "@/lib/youtube-data/config";

export type AnalyticsConnectionPublic = {
  connected: boolean;
  status: string;
  channelId: string;
  channelTitle: string;
  googleAccountEmail: string;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string;
};

export async function getAnalyticsConnectionPublic(): Promise<AnalyticsConnectionPublic> {
  const db = getDb();
  const row = await db.youTubeAnalyticsConnection.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (!row || row.status === "disconnected" || !row.refreshTokenEnc) {
    return {
      connected: false,
      status: row?.status || "disconnected",
      channelId: "",
      channelTitle: "",
      googleAccountEmail: "",
      connectedAt: null,
      lastSyncAt: null,
      lastError: row?.lastError || "",
    };
  }
  return {
    connected: row.status === "connected" || row.status === "error",
    status: row.status,
    channelId: row.channelId,
    channelTitle: row.channelTitle,
    googleAccountEmail: row.googleAccountEmail,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

export async function saveAnalyticsConnection(input: {
  accessToken: string;
  refreshToken: string;
  scopes?: string;
  adminId: string;
}): Promise<{ channelId: string; channelTitle: string }> {
  const expectedChannelId = await resolveYoutubeChannelId();
  const mine = await fetchMineYoutubeChannel(input.accessToken);
  if (!mine) {
    throw new YouTubeAnalyticsError(
      "channel_mismatch",
      "No YouTube channel was found for the authorized Google account.",
    );
  }
  if (mine.channelId !== expectedChannelId) {
    throw new YouTubeAnalyticsError(
      "channel_mismatch",
      `Authorized channel (${mine.title}) does not match the Mesa Kitchen Studio channel. Connect the correct Google account.`,
      `expected=${expectedChannelId} got=${mine.channelId}`,
    );
  }

  const email = await fetchGoogleAccountEmail(input.accessToken);
  const sealed = sealSecret(input.refreshToken);
  const db = getDb();
  const existing = await db.youTubeAnalyticsConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  const data = {
    channelId: mine.channelId,
    channelTitle: mine.title,
    googleAccountEmail: email,
    refreshTokenEnc: sealed.ciphertext,
    tokenIv: sealed.iv,
    tokenAuthTag: sealed.authTag,
    scopes: input.scopes?.trim() || YT_ANALYTICS_SCOPES.join(" "),
    status: "connected",
    connectedAt: new Date(),
    connectedByAdminId: input.adminId,
    lastRefreshAt: new Date(),
    lastError: "",
  };

  if (existing) {
    await db.youTubeAnalyticsConnection.update({ where: { id: existing.id }, data });
  } else {
    await db.youTubeAnalyticsConnection.create({ data });
  }

  return { channelId: mine.channelId, channelTitle: mine.title };
}

export async function disconnectAnalyticsConnection(): Promise<void> {
  const db = getDb();
  const row = await db.youTubeAnalyticsConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!row) return;

  if (row.refreshTokenEnc && row.tokenIv && row.tokenAuthTag) {
    try {
      const refreshToken = openSecret({
        ciphertext: row.refreshTokenEnc,
        iv: row.tokenIv,
        authTag: row.tokenAuthTag,
      });
      await revokeGoogleToken(refreshToken);
    } catch {
      // Ignore revoke / decrypt failures on disconnect.
    }
  }

  await db.youTubeAnalyticsConnection.update({
    where: { id: row.id },
    data: {
      status: "disconnected",
      refreshTokenEnc: "",
      tokenIv: "",
      tokenAuthTag: "",
      lastError: "",
      lastRefreshAt: null,
    },
  });
}

/** Load a valid access token using the stored refresh token. */
export async function getAnalyticsAccessToken(): Promise<{
  accessToken: string;
  channelId: string;
}> {
  const db = getDb();
  const row = await db.youTubeAnalyticsConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!row || !row.refreshTokenEnc || row.status === "disconnected") {
    throw new YouTubeAnalyticsError(
      "not_connected",
      "YouTube Analytics is not connected.",
    );
  }

  let refreshToken: string;
  try {
    refreshToken = openSecret({
      ciphertext: row.refreshTokenEnc,
      iv: row.tokenIv,
      authTag: row.tokenAuthTag,
    });
  } catch {
    await db.youTubeAnalyticsConnection.update({
      where: { id: row.id },
      data: { status: "error", lastError: "Stored Analytics credentials could not be decrypted." },
    });
    throw new YouTubeAnalyticsError(
      "refresh_failed",
      "Stored YouTube Analytics credentials could not be read. Disconnect and connect again.",
    );
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);
    await db.youTubeAnalyticsConnection.update({
      where: { id: row.id },
      data: { status: "connected", lastRefreshAt: new Date(), lastError: "" },
    });
    return { accessToken: tokens.access_token, channelId: row.channelId };
  } catch (error) {
    const message =
      error instanceof YouTubeAnalyticsError
        ? error.message
        : "Could not refresh YouTube Analytics access.";
    const status = error instanceof YouTubeAnalyticsError && error.code === "revoked" ? "revoked" : "error";
    await db.youTubeAnalyticsConnection.update({
      where: { id: row.id },
      data: { status, lastError: message },
    });
    throw error;
  }
}

export async function markAnalyticsSyncResult(input: {
  ok: boolean;
  error?: string;
}): Promise<void> {
  const db = getDb();
  const row = await db.youTubeAnalyticsConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!row) return;
  await db.youTubeAnalyticsConnection.update({
    where: { id: row.id },
    data: input.ok
      ? { lastSyncAt: new Date(), lastError: "", status: "connected" }
      : { lastError: input.error || "Analytics sync failed.", status: "error" },
  });
}
