import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canAccess, canManageYoutubeAnalytics } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { saveAnalyticsConnection } from "@/lib/youtube-analytics/connection";
import {
  exchangeAuthorizationCode,
  hashOAuthState,
  OAUTH_STATE_COOKIE,
} from "@/lib/youtube-analytics/oauth";
import { analyticsErrorMessage } from "@/lib/youtube-analytics/errors";
import { syncYoutubeAnalytics } from "@/lib/youtube-analytics/sync";

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
    const saved = await saveAnalyticsConnection({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token!,
      scopes: tokens.scope,
      adminId: admin.id,
    });

    const syncResult = await syncYoutubeAnalytics({ days: 90 });
    jar.delete(OAUTH_STATE_COOKIE);
    return redirectToYoutube(origin, {
      analyticsConnected: saved.channelTitle || "Mesa Kitchen Studio",
      ...(syncResult.ok ? {} : { analyticsNotice: syncResult.error }),
    });
  } catch (error) {
    jar.delete(OAUTH_STATE_COOKIE);
    return redirectToYoutube(origin, { analyticsError: analyticsErrorMessage(error) });
  }
}
