export type RecipeYoutubeTimestamp = {
  label: string;
  /** Seconds into the video (alias: seconds) */
  time: number;
  /** Optional flat instruction step index (0-based; alias: instructionIndex) */
  stepIndex?: number;
};

export type StageAlignmentSource = "ai_video_analysis" | "youtube_description_hint" | "manual";

export type RecipeStageAlignment = {
  instructionStageId: string;
  instructionSectionTitle: string;
  videoStartSeconds: number;
  videoTimestampLabel: string;
  chapterTitle: string;
  confidence: "VERIFIED" | "HIGH_CONFIDENCE_INFERENCE" | "ESTIMATED" | "UNKNOWN";
  source: StageAlignmentSource;
};

export type RecipeYoutubeRelatedVideo = {
  title: string;
  videoId: string;
  thumbnail?: string;
  /** Alias: thumbnailUrl */
  thumbnailUrl?: string;
  duration?: string;
  url: string;
  label?: string;
  /** Alias: label */
  category?: string;
};

export type RecipeYoutube = {
  videoId?: string;
  title?: string;
  duration?: string;
  thumbnail?: string;
  url?: string;
  /** Contextual sentence under the video heading (alias: sectionDescription) */
  hook?: string;
  sectionDescription?: string;
  /** Secondary copy under the hero “Prefer watching?” CTA (alias: ctaDescription) */
  videoCtaDescription?: string;
  ctaDescription?: string;
  playlistUrl?: string;
  playlistLabel?: string;
  timestamps?: RecipeYoutubeTimestamp[];
  /**
   * Mesa instruction-stage ↔ video alignments (canonical for public chapter/CTA linking).
   * YouTube description chapters are hints only.
   */
  stageAlignments?: RecipeStageAlignment[];
  relatedVideos?: RecipeYoutubeRelatedVideo[];
};

export type ResolvedRecipeYoutube = RecipeYoutube & {
  videoId: string;
  url: string;
  watchUrl: string;
  thumbnail: string;
  title: string;
  hook: string;
  videoCtaDescription: string;
};
