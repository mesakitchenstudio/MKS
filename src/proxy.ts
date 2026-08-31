import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSitePrivate } from "@/lib/flags";
import {
  isBlockedApiWhilePrivate,
  shouldGatePublicRequest,
} from "@/lib/site-gate";

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

  // Recipe/content APIs stay blocked while private (unless staff preview).
  if (isBlockedApiWhilePrivate(pathname, cookieHeader)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isSitePrivate()) {
    return NextResponse.next();
  }

  // Staff with a valid admin session may browse the full public site.
  if (!shouldGatePublicRequest(cookieHeader)) {
    return NextResponse.next();
  }

  // Unblocked APIs (guest analytics, auth, admin, etc.) must not be rewritten to Coming Soon.
  // Rewriting /api/analytics/guest previously returned HTML → POST 405 and no visitor rows.
  if (
    pathname.startsWith("/api/") ||
    PUBLIC_WHILE_PRIVATE.includes(pathname) ||
    pathname.startsWith("/reset-password") ||
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
