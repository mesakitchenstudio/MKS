import { NextResponse, type NextRequest } from "next/server";
import { revokeAdminAuthSessionByTokenId } from "@/lib/admin-auth-sessions";
import { ADMIN_COOKIE, clearAllAuthCookies, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Full account logout from Studio admin.
 * Revokes the current AdminSession registry row, then clears mesa_admin_session
 * and Auth.js public session cookies so a refresh of `/` cannot resurrect a
 * signed-in header.
 */
async function logoutResponse(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (session?.sid) {
    await revokeAdminAuthSessionByTokenId(session.sid, "sign_out");
  }

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
