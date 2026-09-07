import "server-only";
import { createHash, randomBytes } from "crypto";
import { SearchConsoleError } from "@/lib/search-console/errors";
import { SEARCH_CONSOLE_SCOPES } from "@/lib/search-console/scopes";

export const SEARCH_CONSOLE_OAUTH_STATE_COOKIE = "mesa_gsc_oauth_state";

export function searchConsoleOAuthClient() {
  const clientId = process.env.AUTH_GOOGLE_ID?.trim() ?? "";
  const clientSecret = process.env.AUTH_GOOGLE_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new SearchConsoleError(
      "not_configured",
      "Google OAuth is not configured (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).",
    );
  }
  return { clientId, clientSecret };
}

export function searchConsoleRedirectUri(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/admin/search-console/oauth/callback`;
}

export function createSearchConsoleOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function hashSearchConsoleOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function buildSearchConsoleAuthUrl(input: { origin: string; state: string }): string {
  const { clientId } = searchConsoleOAuthClient();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: searchConsoleRedirectUri(input.origin),
    response_type: "code",
    scope: SEARCH_CONSOLE_SCOPES.join(" "),
    access_type: "offline",
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

export async function exchangeSearchConsoleAuthorizationCode(input: {
  origin: string;
  code: string;
}): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = searchConsoleOAuthClient();
  const body = new URLSearchParams({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: searchConsoleRedirectUri(input.origin),
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new SearchConsoleError(
      "token_exchange",
      "Could not complete Search Console authorization.",
      json.error_description || json.error,
    );
  }
  if (!json.refresh_token) {
    throw new SearchConsoleError(
      "token_exchange",
      "Google did not return a refresh token. Disconnect any prior grant and connect again with consent.",
    );
  }
  return json;
}

export async function refreshSearchConsoleAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = searchConsoleOAuthClient();
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
  const json = (await response.json()) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    const revoked = json.error === "invalid_grant";
    throw new SearchConsoleError(
      revoked ? "revoked" : "refresh_failed",
      revoked
        ? "Search Console authorization was revoked. Connect again."
        : "Could not refresh Search Console access.",
      json.error_description || json.error,
    );
  }
  return json;
}

export async function revokeSearchConsoleToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // Best-effort.
  }
}

export async function fetchSearchConsoleGoogleAccountEmail(accessToken: string): Promise<string> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return "";
    const json = (await response.json()) as { email?: string };
    return String(json.email || "").trim();
  } catch {
    return "";
  }
}
