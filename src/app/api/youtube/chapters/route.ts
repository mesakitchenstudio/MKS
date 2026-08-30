import { formatTimestampInput } from "@/lib/youtube-metadata-editor";
import {
  fetchYoutubeVideoDescriptionMeta,
  parseYoutubeDescriptionChapters,
} from "@/lib/youtube-description";

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export async function GET(request: Request) {
  const videoId = new URL(request.url).searchParams.get("videoId")?.trim() ?? "";
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    return Response.json({ error: "Invalid videoId" }, { status: 400 });
  }

  try {
    const meta = await fetchYoutubeVideoDescriptionMeta(videoId);
    if (!meta?.description.trim()) {
      return Response.json(
        { timestamps: [] },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
      );
    }

    const chapters = parseYoutubeDescriptionChapters(meta.description);
    const duration =
      meta.durationSeconds != null && meta.durationSeconds > 0
        ? formatTimestampInput(meta.durationSeconds)
        : undefined;

    return Response.json(
      {
        timestamps: chapters.map((chapter) => ({
          time: chapter.time,
          label: chapter.label,
        })),
        duration,
      },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return Response.json(
      { timestamps: [] },
      { headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  }
}
