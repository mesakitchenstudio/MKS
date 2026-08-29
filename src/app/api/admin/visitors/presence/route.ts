import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { listGuestsPresenceSnapshot } from "@/lib/guest-analytics";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Lightweight Online/Offline snapshot for Admin → Visitors auto-refresh. */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "members")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const visitors = await listGuestsPresenceSnapshot();
    return NextResponse.json({
      visitors,
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error("Could not load visitor presence snapshot", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
