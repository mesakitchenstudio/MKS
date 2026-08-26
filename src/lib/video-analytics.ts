export type VideoAnalyticsSource =
  | "hero_cta"
  | "main_embed"
  | "instruction_timestamp"
  | "floating_card"
  | "floating_player"
  | "related_videos"
  | "watch_next"
  | "videos_page"
  | "playlist"
  | "subscribe";

export type VideoAnalyticsPayload = {
  recipeSlug?: string;
  recipeName?: string;
  videoId?: string;
  videoTitle?: string;
  source: VideoAnalyticsSource;
  timestamp?: number;
};

type VideoAnalyticsEvent =
  | "recipe_video_cta_click"
  | "recipe_video_play"
  | "recipe_video_25_percent"
  | "recipe_video_50_percent"
  | "recipe_video_75_percent"
  | "recipe_video_complete"
  | "recipe_video_timestamp_click"
  | "floating_video_impression"
  | "floating_video_play"
  | "floating_video_close"
  | "related_youtube_video_click"
  | "youtube_playlist_click"
  | "youtube_subscribe_click"
  | "videos_page_video_click";

const firedMilestones = new Set<string>();

function milestoneKey(event: string, videoId: string) {
  return `${event}:${videoId}`;
}

/** Provider-agnostic hook — wire to GA/Plausible later via window listener or tag manager. */
export function trackVideoEvent(event: VideoAnalyticsEvent, payload: VideoAnalyticsPayload) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("mesa:video-analytics", {
        detail: { event, ...payload, at: Date.now() },
      }),
    );
  }
  if (process.env.NODE_ENV === "development") {
    console.debug("[video-analytics]", event, payload);
  }
}

export function trackVideoMilestone(
  percent: 25 | 50 | 75 | 100,
  payload: VideoAnalyticsPayload,
) {
  if (!payload.videoId) return;
  const event =
    percent === 25
      ? "recipe_video_25_percent"
      : percent === 50
        ? "recipe_video_50_percent"
        : percent === 75
          ? "recipe_video_75_percent"
          : "recipe_video_complete";
  const key = milestoneKey(event, payload.videoId);
  if (firedMilestones.has(key)) return;
  firedMilestones.add(key);
  trackVideoEvent(event, payload);
}

export function resetVideoMilestones(videoId?: string) {
  if (!videoId) {
    firedMilestones.clear();
    return;
  }
  for (const key of [...firedMilestones]) {
    if (key.endsWith(`:${videoId}`)) firedMilestones.delete(key);
  }
}
