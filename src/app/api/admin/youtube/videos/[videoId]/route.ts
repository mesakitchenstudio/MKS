import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { findRecipeIdLinkedToVideo, loadSyncedVideoForLink } from "@/lib/youtube-data/video-selector";
import { syncedVideoToEditorPreview } from "@/lib/youtube-data/recipe-link";
import { formatGmtDisplay } from "@/lib/datetime";

export async function GET(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const { videoId } = await context.params;
  const url = new URL(request.url);
  const excludeRecipeId = url.searchParams.get("excludeRecipeId") || undefined;

  const video = await loadSyncedVideoForLink(videoId);
  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  const linkedRecipe = await findRecipeIdLinkedToVideo(videoId, excludeRecipeId);

  return NextResponse.json({
    videoId: video.videoId,
    title: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    durationDisplay: video.durationDisplay,
    durationSeconds: video.durationSeconds,
    privacyStatus: video.privacyStatus,
    embeddable: video.embeddable,
    tags: video.tags,
    watchUrl: syncedVideoToEditorPreview(video).watchUrl,
    publishedAt: video.publishedAt ? formatGmtDisplay(video.publishedAt) : "—",
    linkedRecipe,
  });
}
