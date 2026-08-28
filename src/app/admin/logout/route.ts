import { NextResponse, type NextRequest } from "next/server";
import { clearAllAuthCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Full account logout from Studio admin.
 * Clears mesa_admin_session and Auth.js public session cookies on the response
 * so a refresh of `/` cannot resurrect a signed-in header.
 */
function logoutResponse(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/admin/login", request.url), 303);
  const present = request.cookies.getAll().map((cookie) => cookie.name);
  clearAllAuthCookies(response.cookies, present);
  return response;
}

export async function POST(request: NextRequest) {
  return logoutResponse(request);
}

export async function GET(request: NextRequest) {
  return logoutResponse(request);
}
