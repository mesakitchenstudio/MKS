import type {
  RecipeYoutube,
  RecipeYoutubeRelatedVideo,
  RecipeYoutubeTimestamp,
} from "@/data/youtube-types";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { formatYoutubeDuration, youtubeVideoId, youtubeWatchUrl } from "@/lib/youtube";

export type YoutubeTimestampRow = {
  timeInput: string;
  label: string;
  stepIndex?: number;
};

export type YoutubeRelatedVideoRow = {
  url: string;
  title: string;
  duration: string;
  label: string;
};

/** In-editor state for structured YouTube metadata editing. */
export type YoutubeMetadataEditorState = {
  hook: string;
  duration: string;
  playlistUrl: string;
  playlistLabel: string;
  timestamps: YoutubeTimestampRow[];
  relatedVideos: YoutubeRelatedVideoRow[];
  /** Fields not exposed in the structured UI (videoId, CTA copy, etc.). */
  preserved: Record<string, unknown>;
};

const STRUCTURED_KEYS = new Set([
  "hook",
  "sectionDescription",
  "duration",
  "playlistUrl",
  "playlistLabel",
  "timestamps",
  "relatedVideos",
  "relatedYoutubeVideos",
]);

export function emptyYoutubeMetadataEditorState(): YoutubeMetadataEditorState {
  return {
    hook: "",
    duration: "",
    playlistUrl: "",
    playlistLabel: "",
    timestamps: [],
    relatedVideos: [],
    preserved: {},
  };
}

/** Format seconds for editor display (MM:SS or H:MM:SS). */
export function formatTimestampInput(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Parse editor time input: MM:SS, H:MM:SS, or raw seconds. */
export function parseTimestampInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.some((part) => part === "" || !/^\d+$/.test(part))) return null;

  if (parts.length === 2) {
    const [mins, secs] = parts.map(Number);
    if (secs >= 60) return null;
    return mins * 60 + secs;
  }

  if (parts.length === 3) {
    const [hours, mins, secs] = parts.map(Number);
    if (mins >= 60 || secs >= 60) return null;
    return hours * 3600 + mins * 60 + secs;
  }

  return null;
}

function timestampRowFromParsed(item: RecipeYoutubeTimestamp): YoutubeTimestampRow {
  return {
    timeInput: formatTimestampInput(item.time),
    label: item.label,
    ...(item.stepIndex != null ? { stepIndex: item.stepIndex } : {}),
  };
}

function relatedRowFromParsed(item: RecipeYoutubeRelatedVideo): YoutubeRelatedVideoRow {
  return {
    url: item.url || youtubeWatchUrl(item.videoId) || "",
    title: item.title,
    duration: item.duration ?? "",
    label: item.label ?? "",
  };
}

function extractPreserved(raw: Record<string, unknown>): Record<string, unknown> {
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!STRUCTURED_KEYS.has(key)) {
      preserved[key] = value;
    }
  }
  return preserved;
}

/** Load DB / legacy JSON into structured editor state. */
export function youtubeMetadataToEditorState(value: unknown): YoutubeMetadataEditorState {
  if (value && typeof value === "object" && !Array.isArray(value) && "preserved" in value) {
    const row = value as YoutubeMetadataEditorState;
    return {
      hook: row.hook ?? "",
      duration: row.duration ?? "",
      playlistUrl: row.playlistUrl ?? "",
      playlistLabel: row.playlistLabel ?? "",
      timestamps: Array.isArray(row.timestamps) ? row.timestamps.map((item) => ({ ...item })) : [],
      relatedVideos: Array.isArray(row.relatedVideos)
        ? row.relatedVideos.map((item) => ({ ...item }))
        : [],
      preserved: { ...(row.preserved ?? {}) },
    };
  }

  let raw: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) return emptyYoutubeMetadataEditorState();
    try {
      raw = JSON.parse(value);
    } catch {
      return emptyYoutubeMetadataEditorState();
    }
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyYoutubeMetadataEditorState();
  }

  const row = raw as Record<string, unknown>;
  const parsed = parseRecipeYoutubeBlob(raw);

  return {
    hook: parsed?.hook ?? String(row.hook ?? row.sectionDescription ?? "").trim(),
    duration: parsed?.duration ?? String(row.duration ?? "").trim(),
    playlistUrl: parsed?.playlistUrl ?? String(row.playlistUrl ?? "").trim(),
    playlistLabel: parsed?.playlistLabel ?? String(row.playlistLabel ?? "").trim(),
    timestamps: (parsed?.timestamps ?? []).map(timestampRowFromParsed),
    relatedVideos: (parsed?.relatedVideos ?? []).map(relatedRowFromParsed),
    preserved: extractPreserved(row),
  };
}

export function youtubeMetadataEditorHasContent(state: YoutubeMetadataEditorState): boolean {
  if (
    state.hook.trim() ||
    state.duration.trim() ||
    state.playlistUrl.trim() ||
    state.playlistLabel.trim()
  ) {
    return true;
  }
  if (
    state.timestamps.some(
      (row) => row.label.trim() || row.timeInput.trim() || row.stepIndex != null,
    )
  ) {
    return true;
  }
  if (
    state.relatedVideos.some(
      (row) => row.url.trim() || row.title.trim() || row.duration.trim() || row.label.trim(),
    )
  ) {
    return true;
  }
  return Object.keys(state.preserved).length > 0;
}

export type YoutubeMetadataValidationIssue = {
  path: string;
  message: string;
};

export function validateYoutubeMetadataEditorState(
  state: YoutubeMetadataEditorState,
): YoutubeMetadataValidationIssue[] {
  const issues: YoutubeMetadataValidationIssue[] = [];

  state.timestamps.forEach((row, index) => {
    const hasLabel = row.label.trim().length > 0;
    const hasTime = row.timeInput.trim().length > 0;
    if (!hasLabel && !hasTime) return;
    if (!hasLabel) {
      issues.push({ path: `timestamps.${index}.label`, message: "Chapter label is required." });
    }
    if (!hasTime) {
      issues.push({ path: `timestamps.${index}.time`, message: "Chapter time is required." });
    } else if (parseTimestampInput(row.timeInput) == null) {
      issues.push({
        path: `timestamps.${index}.time`,
        message: "Use MM:SS, H:MM:SS, or seconds (e.g. 45).",
      });
    }
  });

  state.relatedVideos.forEach((row, index) => {
    const url = row.url.trim();
    if (!url) return;
    if (!youtubeVideoId(url)) {
      issues.push({
        path: `relatedVideos.${index}.url`,
        message: "Enter a valid YouTube URL.",
      });
    }
  });

  const playlistUrl = state.playlistUrl.trim();
  if (playlistUrl && !/^https?:\/\//i.test(playlistUrl)) {
    issues.push({
      path: "playlistUrl",
      message: "Playlist URL must start with http:// or https://.",
    });
  }

  return issues;
}

function buildTimestamps(rows: YoutubeTimestampRow[]): RecipeYoutubeTimestamp[] {
  const results: RecipeYoutubeTimestamp[] = [];
  for (const row of rows) {
    const label = row.label.trim();
    const time = parseTimestampInput(row.timeInput);
    if (!label || time == null) continue;
    results.push({
      label,
      time,
      ...(row.stepIndex != null ? { stepIndex: row.stepIndex } : {}),
    });
  }
  return results;
}

function buildRelatedVideos(rows: YoutubeRelatedVideoRow[]): RecipeYoutubeRelatedVideo[] {
  const results: RecipeYoutubeRelatedVideo[] = [];
  for (const row of rows) {
    const url = row.url.trim();
    const videoId = url ? youtubeVideoId(url) : null;
    if (!videoId) continue;
    const title = row.title.trim() || `YouTube video ${videoId}`;
    results.push({
      title,
      videoId,
      url: youtubeWatchUrl(videoId) || url,
      duration: row.duration.trim() || undefined,
      label: row.label.trim() || undefined,
      thumbnail: undefined,
    });
  }
  return results;
}

/** Serialize editor state back to the stored `youtube` blob shape. */
export function serializeYoutubeMetadataEditorState(
  state: YoutubeMetadataEditorState,
): Record<string, unknown> | null {
  const blob: Record<string, unknown> = { ...state.preserved };

  const hook = state.hook.trim();
  if (hook) blob.hook = hook;
  else {
    delete blob.hook;
    delete blob.sectionDescription;
  }

  const duration = state.duration.trim();
  if (duration) blob.duration = duration;
  else delete blob.duration;

  const playlistUrl = state.playlistUrl.trim();
  if (playlistUrl) blob.playlistUrl = playlistUrl;
  else delete blob.playlistUrl;

  const playlistLabel = state.playlistLabel.trim();
  if (playlistLabel) blob.playlistLabel = playlistLabel;
  else delete blob.playlistLabel;

  const timestamps = buildTimestamps(state.timestamps);
  if (timestamps.length) blob.timestamps = timestamps;
  else delete blob.timestamps;

  const relatedVideos = buildRelatedVideos(state.relatedVideos);
  if (relatedVideos.length) blob.relatedVideos = relatedVideos;
  else {
    delete blob.relatedVideos;
    delete blob.relatedYoutubeVideos;
  }

  const hasStructured =
    Boolean(hook || duration || playlistUrl || playlistLabel || timestamps.length || relatedVideos.length);
  const hasPreserved = Object.keys(state.preserved).length > 0;
  if (!hasStructured && !hasPreserved) return null;

  return blob;
}

export function prettyPrintYoutubeMetadataBlob(value: unknown): string {
  const state = youtubeMetadataToEditorState(value);
  const blob = serializeYoutubeMetadataEditorState(state);
  return JSON.stringify(blob ?? {}, null, 2);
}

export function applyRawYoutubeMetadataJson(
  current: YoutubeMetadataEditorState,
  rawText: string,
):
  | { ok: true; state: YoutubeMetadataEditorState }
  | { ok: false; error: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: true, state: emptyYoutubeMetadataEditorState() };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Invalid JSON. Check commas, quotes, and brackets." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "YouTube metadata must be a JSON object." };
  }

  const next = youtubeMetadataToEditorState(parsed);
  const issues = validateYoutubeMetadataEditorState(next);
  if (issues.length) {
    return { ok: false, error: issues[0]?.message ?? "Metadata validation failed." };
  }

  return { ok: true, state: next };
}

/** Human-readable chapter time for public UI (uses duration formatter). */
export function formatChapterTime(seconds: number): string {
  return formatYoutubeDuration(seconds);
}
