import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { YouTubeDataError } from "@/lib/youtube-data/errors";
import { previewYoutubeVideo } from "@/lib/youtube-data/preview";
import { youtubeVideoId } from "@/lib/youtube";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const url = new URL(request.url);
  const videoId = youtubeVideoId(String(url.searchParams.get("videoId") || url.searchParams.get("url") || ""));
  if (!videoId) {
    return NextResponse.json({ error: "A valid YouTube video ID is required." }, { status: 400 });
  }

  try {
    const preview = await previewYoutubeVideo(videoId);
    if (!preview) {
      return NextResponse.json({ error: "Video not found on YouTube." }, { status: 404 });
    }
    return NextResponse.json(preview);
  } catch (error) {
    const message =
      error instanceof YouTubeDataError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load YouTube metadata.";
    const status = error instanceof YouTubeDataError && error.httpStatus ? error.httpStatus : 502;
    return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}
