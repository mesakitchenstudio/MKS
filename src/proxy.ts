import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSitePrivate } from "@/lib/flags";
import { isBlockedApiWhilePrivate } from "@/lib/site-gate";

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

  if (isBlockedApiWhilePrivate(pathname)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isSitePrivate()) {
    return NextResponse.next();
  }
  if (
    PUBLIC_WHILE_PRIVATE.includes(pathname) ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/account") ||
    pathname.startsWith("/api/favorites") ||
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
