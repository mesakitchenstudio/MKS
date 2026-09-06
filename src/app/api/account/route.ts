import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { expireAuthCookie, isPublicAuthCookieName } from "@/lib/auth-cookies";
import { deleteMemberAccount } from "@/lib/member-account-deletion";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/account — self-service member account deletion.
 * Target identity comes only from the Auth.js session (never from the body).
 */
export async function DELETE() {
  const session = await auth();
  const email = session?.user?.email?.trim() || "";

  if (!email || session?.error === "MemberDeleted" || session?.error === "SessionRevoked") {
    return NextResponse.json({ error: "Sign in to delete your account." }, { status: 401 });
  }

  if (session?.staffRole) {
    return NextResponse.json(
      { error: "Studio admin accounts cannot be deleted from the public profile." },
      { status: 403 },
    );
  }

  const result = await deleteMemberAccount(email);
  if (!result.ok) {
    const status = result.reason === "staff" ? 403 : result.reason === "invalid_email" ? 400 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  const response = NextResponse.json({ ok: true, alreadyDeleted: Boolean(result.alreadyDeleted) });
  const jar = await cookies();
  const present = jar.getAll().map((cookie) => cookie.name);
  for (const name of present) {
    if (isPublicAuthCookieName(name)) {
      expireAuthCookie(response.cookies, name);
    }
  }
  return response;
}
