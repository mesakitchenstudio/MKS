import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
  if (process.env.SITE_PRIVATE !== "true") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
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
