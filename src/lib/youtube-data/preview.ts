import { fetchVideo } from "@/lib/youtube-data/client";
import { YouTubeDataError } from "@/lib/youtube-data/errors";
import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";

export type YoutubeVideoPreview = {
  videoId: string;
  title: string;
  durationDisplay: string;
  thumbnailUrl: string;
  privacyStatus: string;
  embeddable: boolean;
  chapterCount: number;
};

export async function previewYoutubeVideo(videoId: string): Promise<YoutubeVideoPreview | null> {
  try {
    const video = await fetchVideo(videoId);
    if (!video) return null;
    const chapters = parseYoutubeDescriptionChapters(video.description);
    return {
      videoId: video.videoId,
      title: video.title,
      durationDisplay: video.durationDisplay,
      thumbnailUrl: video.thumbnailUrl,
      privacyStatus: video.privacyStatus,
      embeddable: video.embeddable,
      chapterCount: chapters.length,
    };
  } catch (error) {
    if (error instanceof YouTubeDataError) {
      throw error;
    }
    throw new YouTubeDataError("api_error", "Could not load YouTube video metadata.");
  }
}
