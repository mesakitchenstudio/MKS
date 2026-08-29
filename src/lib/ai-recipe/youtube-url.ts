import { youtubeVideoId, youtubeWatchUrl } from "@/lib/youtube";

export type NormalizedYouTubeInput = {
  /** URL as entered by the editor */
  originalUrl: string;
  videoId: string;
  /** Canonical watch URL for Gemini video input */
  canonicalUrl: string;
};

/**
 * Accept common YouTube URL shapes, extract the video ID, and normalize to
 * https://www.youtube.com/watch?v=VIDEO_ID (tracking params stripped).
 */
export function normalizeYouTubeForGemini(input: string): NormalizedYouTubeInput | null {
  const originalUrl = input.trim();
  if (!originalUrl) return null;

  const videoId = youtubeVideoId(originalUrl);
  if (!videoId) return null;

  const canonicalUrl = youtubeWatchUrl(videoId);
  if (!canonicalUrl) return null;

  return { originalUrl, videoId, canonicalUrl };
}
