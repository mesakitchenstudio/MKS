import { NextResponse } from "next/server";
import { canAccess, canManageYoutubeAnalytics } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { disconnectAnalyticsConnection } from "@/lib/youtube-analytics/connection";
import { analyticsErrorMessage } from "@/lib/youtube-analytics/errors";

export const runtime = "nodejs";

export async function POST() {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "youtube") || !canManageYoutubeAnalytics(admin.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    await disconnectAnalyticsConnection();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: analyticsErrorMessage(error) }, { status: 500 });
  }
}
