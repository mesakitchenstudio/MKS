import "server-only";
import { YouTubeAnalyticsError } from "@/lib/youtube-analytics/errors";
import { getAnalyticsAccessToken } from "@/lib/youtube-analytics/connection";

export type AnalyticsMetricRow = {
  day?: string;
  video?: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
};

export type TrafficMetricRow = {
  day: string;
  dimensionValue: string;
  views: number;
  estimatedMinutesWatched: number;
};

const CHANNEL_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "comments",
  "shares",
].join(",");

/** Top videos report metrics (supported channel video report combination). */
const TOP_VIDEO_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "subscribersGained",
  "subscribersLost",
  "shares",
].join(",");

const TOP_VIDEO_METRICS_CORE = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "subscribersGained",
  "shares",
].join(",");

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapMetricRow(headers: string[], cells: unknown[]): AnalyticsMetricRow {
  const get = (name: string) => {
    const index = headers.indexOf(name);
    return index >= 0 ? cells[index] : 0;
  };
  return {
    day: headers.includes("day") ? String(get("day") ?? "") : undefined,
    video: headers.includes("video") ? String(get("video") ?? "") : undefined,
    views: num(get("views")),
    estimatedMinutesWatched: num(get("estimatedMinutesWatched")),
    averageViewDuration: num(get("averageViewDuration")),
    averageViewPercentage: num(get("averageViewPercentage")),
    subscribersGained: num(get("subscribersGained")),
    subscribersLost: num(get("subscribersLost")),
    likes: num(get("likes")),
    comments: num(get("comments")),
    shares: num(get("shares")),
  };
}

/** Safe server log — never includes tokens, secrets, or Authorization headers. */
function logReportsFailure(input: {
  status: number;
  ids: string;
  dimensions: string;
  metrics: string;
  startDate: string;
  endDate: string;
  sort?: string;
  maxResults?: number;
  filtersPresent: boolean;
  reason?: string;
  message?: string;
}) {
  console.error("[youtube-analytics] reports.query failed", {
    status: input.status,
    ids: input.ids,
    dimensions: input.dimensions,
    metrics: input.metrics,
    startDate: input.startDate,
    endDate: input.endDate,
    sort: input.sort,
    maxResults: input.maxResults,
    filtersPresent: input.filtersPresent,
    reason: input.reason || "",
    message: input.message || "",
  });
}

async function fetchReports(input: {
  accessToken: string;
  channelId: string;
  startDate: string;
  endDate: string;
  metrics: string;
  dimensions: string;
  filters?: string;
  sort?: string;
  maxResults?: number;
}): Promise<{ headers: string[]; rows: unknown[][] }> {
  // Prefer channel==MINE with Brand Account OAuth tokens; fall back to explicit channel id.
  const idsList = input.channelId
    ? ["channel==MINE", `channel==${input.channelId}`]
    : ["channel==MINE"];

  let lastError: YouTubeAnalyticsError | null = null;

  for (const ids of idsList) {
    const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
    url.searchParams.set("ids", ids);
    url.searchParams.set("startDate", input.startDate);
    url.searchParams.set("endDate", input.endDate);
    url.searchParams.set("metrics", input.metrics);
    url.searchParams.set("dimensions", input.dimensions);
    if (input.filters) url.searchParams.set("filters", input.filters);
    if (input.sort) url.searchParams.set("sort", input.sort);
    if (typeof input.maxResults === "number") {
      url.searchParams.set("maxResults", String(input.maxResults));
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
    const json = (await response.json()) as {
      columnHeaders?: Array<{ name?: string }>;
      rows?: unknown[][];
      error?: { code?: number; message?: string; errors?: Array<{ reason?: string }> };
    };

    const apiMessage = String(json.error?.message || "").trim();
    const reason = json.error?.errors?.[0]?.reason || "";

    if (response.ok) {
      const headers = (json.columnHeaders || []).map((header) => String(header.name || ""));
      return { headers, rows: Array.isArray(json.rows) ? json.rows : [] };
    }

    logReportsFailure({
      status: response.status,
      ids,
      dimensions: input.dimensions,
      metrics: input.metrics,
      startDate: input.startDate,
      endDate: input.endDate,
      sort: input.sort,
      maxResults: input.maxResults,
      filtersPresent: Boolean(input.filters),
      reason,
      message: apiMessage,
    });

    if (response.status === 403 || response.status === 401) {
      if (reason.includes("quota") || reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
        throw new YouTubeAnalyticsError("quota", "YouTube Analytics quota exceeded. Try again later.");
      }
      throw new YouTubeAnalyticsError(
        "api_error",
        apiMessage
          ? `YouTube Analytics authorization failed: ${apiMessage}`
          : "YouTube Analytics authorization failed. Disconnect and connect again if this continues.",
        apiMessage || undefined,
      );
    }

    lastError = new YouTubeAnalyticsError(
      "api_error",
      apiMessage ? `YouTube Analytics request failed: ${apiMessage}` : "YouTube Analytics request failed.",
      apiMessage || undefined,
    );
    if (ids === "channel==MINE" && idsList.length > 1) continue;
    throw lastError;
  }

  throw lastError || new YouTubeAnalyticsError("api_error", "YouTube Analytics request failed.");
}

/** Core channel metrics first; fall back if a fuller metric set is rejected. */
const CHANNEL_METRICS_CORE = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "subscribersGained",
  "subscribersLost",
].join(",");

export async function fetchChannelDayMetrics(input: {
  startDate: string;
  endDate: string;
}): Promise<AnalyticsMetricRow[]> {
  const { accessToken, channelId } = await getAnalyticsAccessToken();
  try {
    const { headers, rows } = await fetchReports({
      accessToken,
      channelId,
      startDate: input.startDate,
      endDate: input.endDate,
      metrics: CHANNEL_METRICS,
      dimensions: "day",
    });
    return rows.map((cells) => mapMetricRow(headers, cells));
  } catch (error) {
    if (!(error instanceof YouTubeAnalyticsError) || error.code === "quota") throw error;
    const { headers, rows } = await fetchReports({
      accessToken,
      channelId,
      startDate: input.startDate,
      endDate: input.endDate,
      metrics: CHANNEL_METRICS_CORE,
      dimensions: "day",
    });
    return rows.map((cells) => mapMetricRow(headers, cells));
  }
}

/**
 * Channel Top videos report for a date window.
 * Requires dimensions=video, sort, and maxResults <= 200 (Google channel reports).
 */
export async function fetchTopVideoMetrics(input: {
  startDate: string;
  endDate: string;
}): Promise<AnalyticsMetricRow[]> {
  const { accessToken, channelId } = await getAnalyticsAccessToken();

  const run = (metrics: string) =>
    fetchReports({
      accessToken,
      channelId,
      startDate: input.startDate,
      endDate: input.endDate,
      metrics,
      dimensions: "video",
      sort: "-views",
      maxResults: 200,
    });

  try {
    const { headers, rows } = await run(TOP_VIDEO_METRICS);
    return rows.map((cells) => mapMetricRow(headers, cells));
  } catch (error) {
    if (!(error instanceof YouTubeAnalyticsError) || error.code === "quota") throw error;
    const { headers, rows } = await run(TOP_VIDEO_METRICS_CORE);
    return rows.map((cells) => mapMetricRow(headers, cells));
  }
}

export async function fetchChannelTrafficByDimension(input: {
  startDate: string;
  endDate: string;
  dimension: "insightTrafficSourceType" | "insightTrafficSourceDetail" | "insightPlaybackLocationType";
}): Promise<TrafficMetricRow[]> {
  const { accessToken, channelId } = await getAnalyticsAccessToken();
  try {
    const { headers, rows } = await fetchReports({
      accessToken,
      channelId,
      startDate: input.startDate,
      endDate: input.endDate,
      metrics: "views,estimatedMinutesWatched",
      dimensions: `day,${input.dimension}`,
    });
    const dayIndex = headers.indexOf("day");
    const dimIndex = headers.indexOf(input.dimension);
    const viewsIndex = headers.indexOf("views");
    const watchIndex = headers.indexOf("estimatedMinutesWatched");
    return rows.map((cells) => ({
      day: String(dayIndex >= 0 ? cells[dayIndex] : ""),
      dimensionValue: String(dimIndex >= 0 ? cells[dimIndex] : ""),
      views: num(viewsIndex >= 0 ? cells[viewsIndex] : 0),
      estimatedMinutesWatched: num(watchIndex >= 0 ? cells[watchIndex] : 0),
    }));
  } catch (error) {
    if (error instanceof YouTubeAnalyticsError && error.code === "quota") throw error;
    return [];
  }
}
