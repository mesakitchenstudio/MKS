import { NextResponse } from "next/server";
import { resolvePublicStaffForAdmin } from "@/lib/admin-bridge";
import { homeForRole } from "@/lib/admin-access";
import { syncStaffGooglePhoto } from "@/lib/accounts";
import { createAdminAuthSession } from "@/lib/admin-auth-sessions";
import { ADMIN_GOOGLE_SESSION_SOURCE } from "@/lib/admin-google-session";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createSessionToken,
  persistAdminLastSeen,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Complete an EXPLICIT Admin Google authentication.
 *
 * Requires `?source=google-admin` (set by the Admin login Google button).
 * A public member session alone must never mint AdminSession here — that would
 * defeat Owner revoke-all.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  if (source !== ADMIN_GOOGLE_SESSION_SOURCE) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const resolved = await resolvePublicStaffForAdmin();

  if (resolved.status === "unauthenticated") {
    return NextResponse.redirect(new URL("/admin/login?error=google", request.url));
  }

  if (resolved.status === "unauthorized") {
    return NextResponse.redirect(new URL("/admin/login?error=not-admin", request.url));
  }

  await syncStaffGooglePhoto(resolved.email, resolved.image);
  await persistAdminLastSeen(resolved.staff);
  const row = await createAdminAuthSession({
    adminId: resolved.staff.id,
    headers: request.headers,
  });
  const response = NextResponse.redirect(
    new URL(homeForRole(resolved.staff.role), request.url),
  );
  response.cookies.set(
    ADMIN_COOKIE,
    createSessionToken({
      ...resolved.staff,
      sid: row.sessionTokenId,
      exp: row.expiresAt.getTime(),
    }),
    adminCookieOptions(),
  );
  return response;
}
