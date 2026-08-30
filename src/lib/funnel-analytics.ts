/** Website → YouTube funnel event names and client helpers (no secrets). */

export const FUNNEL_EVENT_NAMES = [
  "recipe_video_play",
  "recipe_video_chapter_click",
  "recipe_watch_on_youtube_click",
  "recipe_youtube_subscribe_click",
  "recipe_watch_next_click",
  "recipe_video_ended",
  "series_item_click",
  "series_watch_click",
  "series_watch_playlist_on_youtube_click",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

export type FunnelPlacement =
  | "hero"
  | "video_section"
  | "floating_player"
  | "recipe_card"
  | "chapter_section"
  | "watch_next"
  | "watch_next_section"
  | "subscribe"
  | "post_video_subscribe"
  | "end_of_recipe"
  | "series_page"
  | "other";

const FUNNEL_NAME_SET = new Set<string>(FUNNEL_EVENT_NAMES);

/** Map mesa:analytics event names → persisted funnel names. */
const CLIENT_EVENT_TO_FUNNEL: Record<string, FunnelEventName> = {
  recipe_video_play: "recipe_video_play",
  recipe_floating_video_play: "recipe_video_play",
  recipe_video_timestamp_click: "recipe_video_chapter_click",
  recipe_video_watch_youtube_click: "recipe_watch_on_youtube_click",
  recipe_youtube_subscribe_click: "recipe_youtube_subscribe_click",
  recipe_related_video_click: "recipe_watch_next_click",
  recipe_watch_next_click: "recipe_watch_next_click",
  recipe_video_complete: "recipe_video_ended",
  series_item_click: "series_item_click",
  series_watch_click: "series_watch_click",
  series_watch_playlist_on_youtube_click: "series_watch_playlist_on_youtube_click",
};

const SOURCE_TO_PLACEMENT: Record<string, FunnelPlacement> = {
  hero_cta: "hero",
  main_embed: "video_section",
  main_video_section: "video_section",
  main_embed_chapter: "chapter_section",
  instruction_timestamp: "chapter_section",
  floating_card: "floating_player",
  floating_player: "floating_player",
  floating_video: "floating_player",
  related_videos: "watch_next",
  watch_next: "watch_next",
  watch_next_section: "watch_next_section",
  videos_page: "other",
  playlist: "other",
  subscribe: "end_of_recipe",
  end_of_recipe: "end_of_recipe",
  post_video_subscribe: "post_video_subscribe",
  series_page: "series_page",
  series_page_footer: "series_page",
};

const BLOCKED_META_KEYS = new Set([
  "email",
  "authorEmail",
  "authorName",
  "comment",
  "body",
  "name",
  "search",
  "query",
  "ip",
  "userAgent",
]);

export function isFunnelEventName(value: unknown): value is FunnelEventName {
  return typeof value === "string" && FUNNEL_NAME_SET.has(value);
}

export function mapClientEventToFunnelName(clientEvent: string): FunnelEventName | null {
  return CLIENT_EVENT_TO_FUNNEL[clientEvent] || null;
}

export function mapSourceToPlacement(source: unknown): FunnelPlacement {
  const key = String(source || "").trim();
  return SOURCE_TO_PLACEMENT[key] || "other";
}

export type FunnelEventPayload = {
  name: FunnelEventName;
  recipeId?: string;
  recipeSlug?: string;
  youtubeVideoId?: string;
  targetRecipeId?: string;
  targetVideoId?: string;
  placement?: FunnelPlacement | string;
  chapterLabel?: string;
  chapterTimeSeconds?: number | null;
  chapterIndex?: number | null;
  meta?: Record<string, unknown>;
  clientVisitorKey?: string;
};

export function sanitizeFunnelMeta(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (BLOCKED_META_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = typeof value === "string" ? value.slice(0, 500) : value;
    }
  }
  return out;
}

/** Build a funnel payload from a mesa:analytics CustomEvent detail. */
export function funnelPayloadFromAnalyticsDetail(
  detail: Record<string, unknown>,
): FunnelEventPayload | null {
  const clientEvent = String(detail.event || "").trim();
  const name = mapClientEventToFunnelName(clientEvent);
  if (!name) return null;

  const recipeSlug = String(detail.recipe_slug || detail.target_recipe_slug || "").trim();
  const youtubeVideoId = String(detail.video_id || detail.related_video_id || "").trim();
  const targetVideoId = String(detail.related_video_id || detail.target_video_id || "").trim();
  const chapterTime =
    typeof detail.timestamp === "number"
      ? detail.timestamp
      : typeof detail.chapter_time_seconds === "number"
        ? detail.chapter_time_seconds
        : null;
  const chapterIndex =
    typeof detail.chapter_index === "number"
      ? detail.chapter_index
      : typeof detail.chapterIndex === "number"
        ? detail.chapterIndex
        : null;
  const chapterLabel = String(detail.chapter_label || detail.chapterLabel || "").trim();

  return {
    name,
    recipeId: String(detail.recipe_id || "").trim() || undefined,
    recipeSlug: recipeSlug || undefined,
    youtubeVideoId: youtubeVideoId || undefined,
    targetRecipeId: String(detail.target_recipe_id || "").trim() || undefined,
    targetVideoId: targetVideoId || undefined,
    placement: mapSourceToPlacement(detail.source),
    chapterLabel: chapterLabel || undefined,
    chapterTimeSeconds: chapterTime,
    chapterIndex,
    meta: sanitizeFunnelMeta({
      video_title: detail.video_title,
      recipe_title: detail.recipe_title,
      client_event: clientEvent,
      source: detail.source,
      target_recipe_slug: detail.target_recipe_slug,
      destination_recipe_slug: detail.destination_recipe_slug,
      series_id: detail.series_id,
      series_slug: detail.series_slug,
      item_position: detail.item_position,
      playlist_id: detail.playlist_id,
    }),
  };
}

/**
 * Fire-and-forget persist. Never throws to the caller / never blocks navigation.
 */
export function recordFunnelEvent(payload: FunnelEventPayload): void {
  if (typeof window === "undefined") return;
  if (!isFunnelEventName(payload.name)) return;

  const body = JSON.stringify({
    name: payload.name,
    recipeId: payload.recipeId || "",
    recipeSlug: payload.recipeSlug || "",
    youtubeVideoId: payload.youtubeVideoId || "",
    targetRecipeId: payload.targetRecipeId || "",
    targetVideoId: payload.targetVideoId || "",
    placement: payload.placement || "",
    chapterLabel: payload.chapterLabel || "",
    chapterTimeSeconds: payload.chapterTimeSeconds ?? null,
    chapterIndex: payload.chapterIndex ?? null,
    meta: payload.meta || {},
    clientVisitorKey: payload.clientVisitorKey || "",
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/analytics/events", blob)) return;
    }
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      /* fail open */
    });
  } catch {
    /* fail open */
  }
}
