import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canAccess, canManageYoutubeAnalytics } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import {
  buildAnalyticsAuthUrl,
  createOAuthState,
  hashOAuthState,
  OAUTH_STATE_COOKIE,
} from "@/lib/youtube-analytics/oauth";
import { analyticsErrorMessage } from "@/lib/youtube-analytics/errors";

export const runtime = "nodejs";

function requestOrigin(request: Request): string {
  if (process.env.VERCEL) {
    return "https://www.mesakitchenstudio.com";
  }
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "youtube") || !canManageYoutubeAnalytics(admin.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const state = createOAuthState();
    const includeWriteScope = new URL(request.url).searchParams.get("write") === "1";
    const authUrl = buildAnalyticsAuthUrl({
      origin: requestOrigin(request),
      state,
      includeWriteScope,
    });

    const jar = await cookies();
    jar.set(OAUTH_STATE_COOKIE, hashOAuthState(state), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = analyticsErrorMessage(error);
    return NextResponse.redirect(
      new URL(`/admin/youtube?analyticsError=${encodeURIComponent(message)}`, requestOrigin(request)),
    );
  }
}
