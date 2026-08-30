import "server-only";
import { createHash, randomBytes } from "crypto";
import { YouTubeAnalyticsError } from "@/lib/youtube-analytics/errors";

export const YT_ANALYTICS_SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

export const OAUTH_STATE_COOKIE = "mesa_yt_analytics_oauth_state";

export function youtubeAnalyticsOAuthClient() {
  const clientId = process.env.AUTH_GOOGLE_ID?.trim() ?? "";
  const clientSecret = process.env.AUTH_GOOGLE_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new YouTubeAnalyticsError(
      "not_configured",
      "Google OAuth is not configured (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).",
    );
  }
  return { clientId, clientSecret };
}

export function youtubeAnalyticsRedirectUri(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/admin/youtube/analytics/oauth/callback`;
}

export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function buildAnalyticsAuthUrl(input: {
  origin: string;
  state: string;
}): string {
  const { clientId } = youtubeAnalyticsOAuthClient();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: youtubeAnalyticsRedirectUri(input.origin),
    response_type: "code",
    scope: YT_ANALYTICS_SCOPES.join(" "),
    access_type: "offline",
    // Always show account + consent so Owners can pick the channel-owner Google account.
    prompt: "select_account consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export async function exchangeAuthorizationCode(input: {
  origin: string;
  code: string;
}): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = youtubeAnalyticsOAuthClient();
  const body = new URLSearchParams({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: youtubeAnalyticsRedirectUri(input.origin),
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    throw new YouTubeAnalyticsError(
      "token_exchange",
      "Could not complete YouTube Analytics authorization.",
      json.error_description || json.error,
    );
  }
  if (!json.refresh_token) {
    throw new YouTubeAnalyticsError(
      "token_exchange",
      "Google did not return a refresh token. Disconnect any prior grant and connect again with consent.",
    );
  }
  return json;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = youtubeAnalyticsOAuthClient();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    const revoked = json.error === "invalid_grant";
    throw new YouTubeAnalyticsError(
      revoked ? "revoked" : "refresh_failed",
      revoked
        ? "YouTube Analytics authorization was revoked. Connect again."
        : "Could not refresh YouTube Analytics access.",
      json.error_description || json.error,
    );
  }
  return json;
}

export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // Best-effort revoke.
  }
}

export type MineChannel = {
  channelId: string;
  title: string;
  customUrl: string;
};

/** Resolve the authorized user's YouTube channel (Data API, OAuth). */
export async function fetchMineYoutubeChannel(accessToken: string): Promise<MineChannel | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json()) as {
    items?: Array<{ id?: string; snippet?: { title?: string; customUrl?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new YouTubeAnalyticsError(
      "api_error",
      "Could not load the authorized YouTube channel.",
      json.error?.message,
    );
  }
  const item = json.items?.[0];
  if (!item?.id) return null;
  return {
    channelId: item.id,
    title: item.snippet?.title?.trim() || "YouTube channel",
    customUrl: item.snippet?.customUrl?.trim() || "",
  };
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return "";
    const json = (await response.json()) as { email?: string };
    return String(json.email ?? "").trim();
  } catch {
    return "";
  }
}
