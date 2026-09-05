import type { AnalyticsProperties } from "@/lib/analytics";
import { trackEvent } from "@/lib/analytics";

export type VideoAnalyticsSource =
  | "hero_cta"
  | "recipe_top_watch"
  | "main_embed"
  | "main_embed_chapter"
  | "recipe_video_chapters"
  | "video_modal"
  | "instruction_timestamp"
  | "instruction_context"
  | "stage_video_help"
  | "floating_card"
  | "floating_player"
  | "related_videos"
  | "watch_next"
  | "watch_next_section"
  | "series_next"
  | "videos_page"
  | "playlist"
  | "subscribe"
  | "end_of_recipe"
  | "post_video_subscribe"
  | "series_page";

export type VideoAnalyticsPayload = {
  recipeSlug?: string;
  recipeName?: string;
  recipeId?: string;
  videoId?: string;
  videoTitle?: string;
  relatedVideoId?: string;
  targetRecipeId?: string;
  targetRecipeSlug?: string;
  source: VideoAnalyticsSource;
  timestamp?: number;
  chapterLabel?: string;
  chapterIndex?: number;
  stageName?: string;
};

type VideoAnalyticsEvent =
  | "recipe_video_cta_click"
  | "recipe_video_expand"
  | "recipe_video_play"
  | "recipe_video_25_percent"
  | "recipe_video_50_percent"
  | "recipe_video_75_percent"
  | "recipe_video_complete"
  | "recipe_video_watch_youtube_click"
  | "recipe_video_timestamp_click"
  | "recipe_video_step_click"
  | "recipe_floating_video_impression"
  | "recipe_floating_video_play"
  | "recipe_floating_video_close"
  | "recipe_related_video_click"
  | "recipe_youtube_playlist_click"
  | "recipe_youtube_subscribe_click"
  | "videos_page_video_click"
  | "videos_featured_click"
  | "videos_card_click"
  | "videos_recipe_click"
  | "videos_format_change"
  | "videos_youtube_outbound_click";

const firedMilestones = new Set<string>();

function milestoneKey(event: string, videoId: string) {
  return `${event}:${videoId}`;
}

function toAnalyticsProps(payload: VideoAnalyticsPayload): AnalyticsProperties {
  return {
    recipe_slug: payload.recipeSlug,
    recipe_title: payload.recipeName,
    recipe_id: payload.recipeId,
    video_id: payload.videoId,
    video_title: payload.videoTitle,
    related_video_id: payload.relatedVideoId,
    target_recipe_id: payload.targetRecipeId,
    target_recipe_slug: payload.targetRecipeSlug,
    source: payload.source,
    timestamp: payload.timestamp,
    chapter_label: payload.chapterLabel,
    chapter_index: payload.chapterIndex,
    stage_name: payload.stageName,
  };
}

export function trackVideoEvent(event: VideoAnalyticsEvent, payload: VideoAnalyticsPayload) {
  trackEvent(event, toAnalyticsProps(payload));
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
  trackEvent(event, toAnalyticsProps(payload));
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
