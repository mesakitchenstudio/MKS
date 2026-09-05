/** Provider-agnostic analytics — wire to GA/Plausible via window listener or tag manager. */

export type AnalyticsEvent =
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
  | "recipe_youtube_subscribe_click"
  | "recipe_youtube_playlist_click"
  | "videos_page_video_click"
  | "recipe_jump_to_recipe"
  | "recipe_start_cooking_click"
  | "recipe_cook_mode_start"
  | "recipe_print"
  | "recipe_share"
  | "recipe_copy_link"
  | "recipe_favorite"
  | "recipe_servings_change"
  | "recipe_comment_submit"
  | "recipe_discovery_search"
  | "recipe_discovery_category_select"
  | "recipe_discovery_sort_change"
  | "recipe_discovery_recipe_click"
  | "series_item_click"
  | "series_watch_click"
  | "series_watch_playlist_on_youtube_click";

export type AnalyticsProperties = {
  recipe_slug?: string;
  recipe_title?: string;
  recipe_id?: string;
  video_id?: string;
  video_title?: string;
  related_video_id?: string;
  target_video_id?: string;
  target_recipe_id?: string;
  target_recipe_slug?: string;
  series_id?: string;
  series_slug?: string;
  playlist_id?: string;
  item_position?: number;
  source?: string;
  placement?: string;
  timestamp?: number;
  chapter_label?: string;
  chapter_index?: number;
  stage_name?: string;
  platform?: string;
  direction?: "increase" | "decrease";
  servings?: number;
  /** Catalog search text — property key `query` is blocked. */
  search_query?: string;
  category?: string;
  sort?: string;
  result_count?: number;
  recipe_position?: number;
};

const BLOCKED_KEYS = new Set([
  "email",
  "authorEmail",
  "authorName",
  "comment",
  "body",
  "name",
  "search",
  "query",
]);

export function trackEvent(event: AnalyticsEvent, properties: AnalyticsProperties = {}) {
  const payload: Record<string, unknown> = { event, at: Date.now() };
  for (const [key, value] of Object.entries(properties)) {
    if (BLOCKED_KEYS.has(key)) continue;
    if (value !== undefined && value !== null && value !== "") {
      payload[key] = value;
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mesa:analytics", { detail: payload }));
    // Legacy listener for video work already wired to mesa:video-analytics
    if (event.startsWith("recipe_video") || event.startsWith("recipe_floating") || event.startsWith("recipe_related") || event.startsWith("recipe_youtube") || event.startsWith("videos_page")) {
      window.dispatchEvent(new CustomEvent("mesa:video-analytics", { detail: payload }));
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.debug("[analytics]", event, payload);
  }
}
