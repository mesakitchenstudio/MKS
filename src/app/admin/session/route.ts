import { NextResponse } from "next/server";
import { resolvePublicStaffForAdmin } from "@/lib/admin-bridge";
import { homeForRole } from "@/lib/admin-access";
import { syncStaffGooglePhoto } from "@/lib/accounts";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createSessionToken,
  persistAdminLastSeen,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Bridge an existing public NextAuth session into a Studio admin session when
 * the authenticated identity has Team Access. Used after Google admin OAuth
 * and when a staff member opens Studio admin from the public site.
 */
export async function GET(request: Request) {
  const resolved = await resolvePublicStaffForAdmin();

  if (resolved.status === "unauthenticated") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (resolved.status === "unauthorized") {
    return NextResponse.redirect(new URL("/admin/login?error=not-admin", request.url));
  }

  await syncStaffGooglePhoto(resolved.email, resolved.image);
  await persistAdminLastSeen(resolved.staff);
  const response = NextResponse.redirect(
    new URL(homeForRole(resolved.staff.role), request.url),
  );
  response.cookies.set(ADMIN_COOKIE, createSessionToken(resolved.staff), adminCookieOptions());
  return response;
}
