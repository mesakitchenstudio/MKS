import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { homeForRole } from "@/lib/admin-access";
import { getStaffByEmail, syncStaffGooglePhoto } from "@/lib/accounts";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createSessionToken,
  persistAdminLastSeen,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.redirect(new URL("/admin/login?error=google", request.url));
  }

  const staff = await getStaffByEmail(email);
  if (!staff) {
    return NextResponse.redirect(new URL("/admin/login?error=not-admin", request.url));
  }

  await syncStaffGooglePhoto(email, session?.user?.image);
  await persistAdminLastSeen(staff);
  const response = NextResponse.redirect(new URL(homeForRole(staff.role), request.url));
  response.cookies.set(ADMIN_COOKIE, createSessionToken(staff), adminCookieOptions());
  return response;
}
