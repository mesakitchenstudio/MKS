import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { listSyncedVideosForSelector } from "@/lib/youtube-data/video-selector";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const excludeRecipeId = url.searchParams.get("excludeRecipeId") || undefined;

  const videos = await listSyncedVideosForSelector({ query, excludeRecipeId });
  return NextResponse.json({ videos });
}
