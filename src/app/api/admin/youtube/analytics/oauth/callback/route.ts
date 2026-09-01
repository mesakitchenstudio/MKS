import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canAccess, canManageYoutubeAnalytics } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { saveAnalyticsConnection } from "@/lib/youtube-analytics/connection";
import {
  exchangeAuthorizationCode,
  hashOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_WRITE_REQUEST_COOKIE,
} from "@/lib/youtube-analytics/oauth";
import { analyticsErrorMessage } from "@/lib/youtube-analytics/errors";
import { syncYoutubeAnalytics } from "@/lib/youtube-analytics/sync";
import { canWriteYoutubeVideoMetadata } from "@/lib/youtube-analytics/oauth-scopes";

export const runtime = "nodejs";
export const maxDuration = 120;

function requestOrigin(request: Request): string {
  if (process.env.VERCEL) {
    return "https://www.mesakitchenstudio.com";
  }
  return new URL(request.url).origin;
}

function redirectToYoutube(origin: string, params: Record<string, string>) {
  const url = new URL("/admin/youtube", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const admin = await getAdminSession();
  const origin = requestOrigin(request);
  const jar = await cookies();

  if (!admin || !canAccess(admin.role, "youtube") || !canManageYoutubeAnalytics(admin.role)) {
    return redirectToYoutube(origin, { analyticsError: "Only owners can connect YouTube Analytics." });
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    jar.delete(OAUTH_STATE_COOKIE);
    return redirectToYoutube(origin, {
      analyticsError:
        error === "access_denied"
          ? "YouTube Analytics authorization was denied."
          : "YouTube Analytics authorization failed.",
    });
  }

  const code = url.searchParams.get("code")?.trim() || "";
  const state = url.searchParams.get("state")?.trim() || "";
  const cookieState = jar.get(OAUTH_STATE_COOKIE)?.value || "";

  if (!code || !state || !cookieState || hashOAuthState(state) !== cookieState) {
    jar.delete(OAUTH_STATE_COOKIE);
    return redirectToYoutube(origin, {
      analyticsError: "YouTube Analytics connection failed security validation. Try again.",
    });
  }

  try {
    const tokens = await exchangeAuthorizationCode({ origin, code });
    const writeRequested = jar.get(OAUTH_WRITE_REQUEST_COOKIE)?.value === "1";
    jar.delete(OAUTH_WRITE_REQUEST_COOKIE);
    const grantedScopes = tokens.scope?.trim() || "";
    const writeGranted = canWriteYoutubeVideoMetadata(grantedScopes);

    const saved = await saveAnalyticsConnection({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token!,
      scopes: grantedScopes,
      adminId: admin.id,
    });

    const syncResult = await syncYoutubeAnalytics({ days: 90 });
    jar.delete(OAUTH_STATE_COOKIE);

    const notices: string[] = [];
    if (writeRequested && !writeGranted) {
      notices.push(
        "Google did not grant permission to update YouTube video descriptions. Reconnect and approve that permission to enable chapter sync updates.",
      );
    }
    if (!syncResult.ok && syncResult.error) {
      notices.push(syncResult.error);
    } else if (syncResult.ok && syncResult.videoMetricsStatus === "API_ERROR") {
      notices.push(
        "Per-video YouTube Analytics could not be loaded. Public YouTube data is still available.",
      );
    }

    return redirectToYoutube(origin, {
      analyticsConnected: saved.channelTitle || "Mesa Kitchen Studio",
      ...(writeRequested && writeGranted ? { analyticsWriteGranted: "1" } : {}),
      ...(notices.length ? { analyticsNotice: notices.join(" ") } : {}),
    });
  } catch (error) {
    jar.delete(OAUTH_WRITE_REQUEST_COOKIE);
    jar.delete(OAUTH_STATE_COOKIE);
    return redirectToYoutube(origin, { analyticsError: analyticsErrorMessage(error) });
  }
}
