import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.SITE_PRIVATE !== "true") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (
    pathname === "/coming-soon" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL("/coming-soon", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
