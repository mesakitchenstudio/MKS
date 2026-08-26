export type RecipeYoutubeTimestamp = {
  label: string;
  time: number;
  /** Optional flat instruction step index (0-based) to attach this link */
  stepIndex?: number;
};

export type RecipeYoutubeRelatedVideo = {
  title: string;
  videoId: string;
  thumbnail?: string;
  duration?: string;
  url: string;
  label?: string;
};

export type RecipeYoutube = {
  videoId?: string;
  title?: string;
  duration?: string;
  thumbnail?: string;
  url?: string;
  /** Contextual sentence under the video heading */
  hook?: string;
  /** Secondary copy under the hero “Prefer watching?” CTA */
  videoCtaDescription?: string;
  playlistUrl?: string;
  playlistLabel?: string;
  timestamps?: RecipeYoutubeTimestamp[];
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
