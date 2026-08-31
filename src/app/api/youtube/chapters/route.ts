import { formatTimestampInput } from "@/lib/youtube-metadata-editor";
import { loadYoutubeChapterTimestampsForVideo } from "@/lib/youtube-description";

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export async function GET(request: Request) {
  const videoId = new URL(request.url).searchParams.get("videoId")?.trim() ?? "";
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    return Response.json({ error: "Invalid videoId" }, { status: 400 });
  }

  try {
    const loaded = await loadYoutubeChapterTimestampsForVideo(videoId);
    const duration =
      loaded.durationSeconds != null && loaded.durationSeconds > 0
        ? formatTimestampInput(loaded.durationSeconds)
        : undefined;

    return Response.json(
      {
        timestamps: loaded.timestamps,
        duration,
      },
      {
        headers: {
          "Cache-Control": loaded.timestamps.length
            ? "public, s-maxage=3600, stale-while-revalidate=86400"
            : "public, s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return Response.json(
      { timestamps: [] },
      { headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  }
}
