import { NextResponse } from "next/server";
import { accessLabel, homeForRole } from "@/lib/admin-access";
import { buildAdminNavSections } from "@/lib/admin-nav";
import {
  ADMIN_COOKIE,
  getAdminSession,
  rewriteAdminSessionCookie,
  verifySessionToken,
} from "@/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/** Live admin identity for the shell — always from the current Team Access row. */
export async function GET() {
  const live = await getAdminSession();
  if (!live || !live.sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jar = await cookies();
  const cookieSession = verifySessionToken(jar.get(ADMIN_COOKIE)?.value);
  if (
    cookieSession &&
    (cookieSession.role !== live.role ||
      cookieSession.id !== live.id ||
      cookieSession.name !== live.name ||
      cookieSession.email !== live.email ||
      cookieSession.sv !== live.sv ||
      cookieSession.sid !== live.sid)
  ) {
    // Keep the signed cookie aligned with the persisted role/session version.
    // Preserve sid so role sync does not mint a new device session.
    await rewriteAdminSessionCookie({
      id: live.id,
      email: live.email,
      name: live.name,
      role: live.role,
      sv: live.sv,
      sid: live.sid,
      exp: live.exp,
    });
  }

  return NextResponse.json({
    role: live.role,
    roleLabel: accessLabel(live.role),
    displayName: live.id === "env" ? "System owner" : live.name.trim() || "Admin",
    homeHref: homeForRole(live.role),
    sections: buildAdminNavSections(live.role),
  });
}
