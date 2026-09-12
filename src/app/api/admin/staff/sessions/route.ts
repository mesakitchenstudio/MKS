import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { loadOwnerAdminSessionGroups } from "@/lib/admin-session-ui";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Owner-only live snapshot for the Staff Sessions panel.
 * Same authorization as /admin/staff Sessions; display-safe fields only.
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin?.sid || !canAccess(admin.role, "staff")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const groups = await loadOwnerAdminSessionGroups(admin);
    return NextResponse.json({
      groups,
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error("Could not load admin staff sessions snapshot", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
