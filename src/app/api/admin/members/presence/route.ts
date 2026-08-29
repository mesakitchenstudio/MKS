import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { listMembersPresenceSnapshot } from "@/lib/accounts";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Lightweight Online/Offline snapshot for Admin → Members auto-refresh. */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "members")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const members = await listMembersPresenceSnapshot();
    return NextResponse.json({
      members,
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error("Could not load member presence snapshot", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
