import { NextResponse } from "next/server";
import { touchAdminSessionPresence } from "@/lib/admin-auth-sessions";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Dedicated Admin presence heartbeat.
 * Touches lastSeenAt for the caller's current AdminSession only.
 * When the public IP changes, refreshes approximate IP/geo on that same row.
 */
export async function POST(request: Request) {
  const live = await getAdminSession();
  if (!live?.sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await touchAdminSessionPresence(live.sid, {
    headers: request.headers,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    updated: result.updated,
    locationUpdated: result.locationUpdated,
    lastSeenAt: result.lastSeenAt.toISOString(),
  });
}
