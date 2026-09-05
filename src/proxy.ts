import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSitePrivate } from "@/lib/flags";
import {
  hasValidAdminSessionFromRequest,
  isBlockedApiWhilePrivate,
  shouldGatePublicRequest,
} from "@/lib/site-gate";
import { shouldGateStudioRequest } from "@/lib/studio-public";

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieHeader = request.headers.get("cookie");
  // Cookie jar is the source of truth; raw header alone can miss the admin session.
  const staffPreview = hasValidAdminSessionFromRequest(request);

  // Recipe/content APIs stay blocked while private (unless staff preview).
  if (isBlockedApiWhilePrivate(pathname, cookieHeader) && !staffPreview) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isSitePrivate()) {
    if (shouldGateStudioRequest(pathname, cookieHeader) && !staffPreview) {
      return NextResponse.rewrite(new URL("/coming-soon", request.url));
    }
    return NextResponse.next();
  }

  // Staff with a valid admin session may browse the full public site.
  if (staffPreview || !shouldGatePublicRequest(cookieHeader)) {
    return NextResponse.next();
  }

  // Unblocked APIs (guest analytics, auth, admin, etc.) must not be rewritten to Coming Soon.
  // Rewriting /api/analytics/guest previously returned HTML → POST 405 and no visitor rows.
  if (
    pathname.startsWith("/api/") ||
    PUBLIC_WHILE_PRIVATE.includes(pathname) ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/newsletter/unsubscribe") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/uploads")
  ) {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL("/coming-soon", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|icon\\.png|apple-icon\\.png|icon\\.svg).*)",
  ],
};
