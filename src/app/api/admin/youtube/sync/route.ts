import { NextResponse } from "next/server";
import { canAccess, canManageYoutubeSync } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { syncYoutubeChannel } from "@/lib/youtube-data/sync";

export async function POST() {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "youtube") || !canManageYoutubeSync(admin.role)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const result = await syncYoutubeChannel({ forceSnapshot: true });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
