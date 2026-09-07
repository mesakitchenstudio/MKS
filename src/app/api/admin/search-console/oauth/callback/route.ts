import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { actorFromAdminSession, recordAdminAuditEvent } from "@/lib/admin-audit";
import { canManageSearchConsole, canViewSearchConsole } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { saveSearchConsoleConnection } from "@/lib/search-console/connection";
import { searchConsoleErrorMessage } from "@/lib/search-console/errors";
import {
  exchangeSearchConsoleAuthorizationCode,
  hashSearchConsoleOAuthState,
  SEARCH_CONSOLE_OAUTH_STATE_COOKIE,
} from "@/lib/search-console/oauth";

export const runtime = "nodejs";
export const maxDuration = 60;

function requestOrigin(request: Request): string {
  if (process.env.VERCEL) {
    return "https://www.mesakitchenstudio.com";
  }
  return new URL(request.url).origin;
}

function redirectToSearchConsole(origin: string, params: Record<string, string>) {
  const url = new URL("/admin/search-console", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const admin = await getAdminSession();
  const origin = requestOrigin(request);
  const jar = await cookies();

  if (!admin || !canViewSearchConsole(admin.role) || !canManageSearchConsole(admin.role)) {
    return redirectToSearchConsole(origin, {
      error: "Only owners can connect Search Console.",
    });
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    jar.delete(SEARCH_CONSOLE_OAUTH_STATE_COOKIE);
    return redirectToSearchConsole(origin, {
      error:
        error === "access_denied"
          ? "Search Console authorization was denied."
          : "Search Console authorization failed.",
    });
  }

  const code = url.searchParams.get("code")?.trim() || "";
  const state = url.searchParams.get("state")?.trim() || "";
  const cookieState = jar.get(SEARCH_CONSOLE_OAUTH_STATE_COOKIE)?.value || "";

  if (!code || !state || !cookieState || hashSearchConsoleOAuthState(state) !== cookieState) {
    jar.delete(SEARCH_CONSOLE_OAUTH_STATE_COOKIE);
    return redirectToSearchConsole(origin, {
      error: "Search Console connection failed security validation. Try again.",
    });
  }

  try {
    const tokens = await exchangeSearchConsoleAuthorizationCode({ origin, code });
    const saved = await saveSearchConsoleConnection({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token!,
      scopes: tokens.scope,
      adminId: admin.id,
    });
    jar.delete(SEARCH_CONSOLE_OAUTH_STATE_COOKIE);
    await recordAdminAuditEvent({
      actor: actorFromAdminSession(admin),
      action: "search_console.connected",
      area: "content",
      entityType: "search_console",
      entityLabel: saved.googleAccountEmail || "Search Console",
      entityPath: "/admin/search-console",
      metadata: { googleAccountEmail: saved.googleAccountEmail },
    });
    return redirectToSearchConsole(origin, {
      connected: saved.googleAccountEmail || "1",
    });
  } catch (error) {
    jar.delete(SEARCH_CONSOLE_OAUTH_STATE_COOKIE);
    return redirectToSearchConsole(origin, { error: searchConsoleErrorMessage(error) });
  }
}
