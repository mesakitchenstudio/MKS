import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canManageSearchConsole, canViewSearchConsole } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import {
  buildSearchConsoleAuthUrl,
  createSearchConsoleOAuthState,
  hashSearchConsoleOAuthState,
  SEARCH_CONSOLE_OAUTH_STATE_COOKIE,
} from "@/lib/search-console/oauth";
import { searchConsoleErrorMessage } from "@/lib/search-console/errors";

export const runtime = "nodejs";

function requestOrigin(request: Request): string {
  if (process.env.VERCEL) {
    return "https://www.mesakitchenstudio.com";
  }
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canViewSearchConsole(admin.role) || !canManageSearchConsole(admin.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const state = createSearchConsoleOAuthState();
    const authUrl = buildSearchConsoleAuthUrl({
      origin: requestOrigin(request),
      state,
    });
    const jar = await cookies();
    jar.set(SEARCH_CONSOLE_OAUTH_STATE_COOKIE, hashSearchConsoleOAuthState(state), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = searchConsoleErrorMessage(error);
    return NextResponse.redirect(
      new URL(
        `/admin/search-console?error=${encodeURIComponent(message)}`,
        requestOrigin(request),
      ),
    );
  }
}
