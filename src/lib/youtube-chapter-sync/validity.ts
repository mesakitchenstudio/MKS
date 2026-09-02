/** YouTube hard minimum seconds per chapter boundary (platform requirement). */
export const YOUTUBE_CHAPTER_MIN_SECONDS = 10;

/** Mesa editorial soft warning when gaps are valid but tight. */
export const YOUTUBE_CHAPTER_EDITORIAL_GAP_SECONDS = 22;

export const YOUTUBE_FIRST_CHAPTER_MUST_START_AT_ZERO_MESSAGE =
  "First YouTube chapter must start at 00:00.";

export function youtubeChapterGapIssue(input: {
  previousTimestamp: number;
  currentTimestamp: number;
}): { hardInvalid: boolean; editorialWarning?: string } | null {
  const gap = input.currentTimestamp - input.previousTimestamp;
  if (gap < YOUTUBE_CHAPTER_MIN_SECONDS) {
    return { hardInvalid: true };
  }
  if (gap < YOUTUBE_CHAPTER_EDITORIAL_GAP_SECONDS) {
    return {
      hardInvalid: false,
      editorialWarning: `Short chapter gap (${gap}s) — valid for YouTube but may feel tight.`,
    };
  }
  return null;
}

export function finalChapterDurationSeconds(
  lastStartTimestamp: number,
  videoDurationSeconds: number,
): number {
  return videoDurationSeconds - lastStartTimestamp;
}

export function isFinalChapterLongEnough(
  lastStartTimestamp: number,
  videoDurationSeconds: number,
): boolean {
  return finalChapterDurationSeconds(lastStartTimestamp, videoDurationSeconds) >= YOUTUBE_CHAPTER_MIN_SECONDS;
}
