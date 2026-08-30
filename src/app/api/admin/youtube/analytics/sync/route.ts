import { NextResponse } from "next/server";
import { canAccess, canManageYoutubeAnalytics } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { syncYoutubeAnalytics } from "@/lib/youtube-analytics/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "youtube") || !canManageYoutubeAnalytics(admin.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await syncYoutubeAnalytics({ days: 90 });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }
  return NextResponse.json({
    ok: true,
    channelDays: result.channelDays,
    videoDays: result.videoDays,
  });
}
