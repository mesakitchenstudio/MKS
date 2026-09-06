import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSitePrivate } from "@/lib/flags";
import {
  hasLiveAdminSessionFromRequest,
  hasValidAdminSessionFromRequest,
  isBlockedApiWhilePrivate,
  shouldGatePublicRequest,
} from "@/lib/site-gate";
import { shouldGateStudioRequest } from "@/lib/studio-public";
import { ADMIN_COOKIE } from "@/lib/admin-session-token";

/** Keep brand icons reachable while the public site is gated. */
const PUBLIC_WHILE_PRIVATE = [
  "/coming-soon",
  "/forgot-password",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/favicon.png",
  "/icon.png",
  "/apple-icon.png",
  "/icon.svg",
];

function clearAdminCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieHeader = request.headers.get("cookie");
  const cryptoAdmin = hasValidAdminSessionFromRequest(request);
  const staffPreview = await hasLiveAdminSessionFromRequest(request);
  const staleAdminCookie = cryptoAdmin && !staffPreview;

  // Recipe/content APIs stay blocked while private (unless live staff preview).
  if (isBlockedApiWhilePrivate(pathname, cookieHeader, staffPreview)) {
    const res = NextResponse.json({ error: "Not found" }, { status: 404 });
    if (staleAdminCookie) clearAdminCookie(res);
    return res;
  }

  if (!isSitePrivate()) {
    if (shouldGateStudioRequest(pathname) && !staffPreview) {
      const res = NextResponse.rewrite(new URL("/coming-soon", request.url));
      if (staleAdminCookie) clearAdminCookie(res);
      return res;
    }
    if (staleAdminCookie) {
      const res = NextResponse.next();
      clearAdminCookie(res);
      return res;
    }
    return NextResponse.next();
  }

  // Live staff may browse the full public site while private.
  if (staffPreview) {
    return NextResponse.next();
  }

  // Unblocked APIs / admin auth surfaces must not be rewritten to Coming Soon.
  if (
    pathname.startsWith("/api/") ||
    PUBLIC_WHILE_PRIVATE.includes(pathname) ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/newsletter/unsubscribe") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/uploads")
  ) {
    const res = NextResponse.next();
    // Clear revoked/deleted staff cookies so login and public gates start clean.
    if (staleAdminCookie) clearAdminCookie(res);
    return res;
  }

  if (shouldGatePublicRequest(cookieHeader, staffPreview) || staleAdminCookie) {
    const res = NextResponse.rewrite(new URL("/coming-soon", request.url));
    if (staleAdminCookie) clearAdminCookie(res);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|icon\\.png|apple-icon\\.png|icon\\.svg).*)",
  ],
};
