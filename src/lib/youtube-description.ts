import { parseTimestampInput, formatTimestampInput } from "@/lib/youtube-metadata-editor";
import { youtubeVideoId } from "@/lib/youtube";
import {
  normalizeAiYoutubeChapters,
  type NormalizedAiYoutubeChapter,
  aiChaptersToTimestamps,
  mergeRecipeYoutubeChapters,
  applyMergedChapterConfidence,
  chaptersFromBlobTimestamps,
} from "@/lib/ai-recipe/youtube-chapters";
import type { AiFieldAnnotation, RecipeAiMeta } from "@/lib/ai-recipe/types";
import { tallyConfidence } from "@/lib/ai-recipe/types";

/** Parse timestamp lines from a YouTube video description (e.g. `0:42 Knead the dough`). */
export function parseYoutubeDescriptionChapters(description: string): NormalizedAiYoutubeChapter[] {
  if (!description.trim()) return [];

  const rows: NormalizedAiYoutubeChapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const trimmed = line
      .trim()
      .replace(/^[-•*●▪︎]\s*/, "")
      .replace(/^\[(\d{1,2}(?::\d{2}){1,2})\]\s*/u, "$1 ")
      .replace(/^\((\d{1,2}(?::\d{2}){1,2})\)\s*/u, "$1 ");
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d{1,2}(?::\d{2}){1,2})\s*[-–—:]?\s+(.+)$/);
    if (!match) continue;

    const seconds = parseTimestampInput(match[1]);
    const label = match[2].trim().replace(/^[-–—:]\s*/, "");
    if (seconds == null || !label) continue;

    rows.push({
      time: seconds,
      label,
      confidence: "VERIFIED",
      sourceNote: "From YouTube video description",
    });
  }

  return normalizeAiYoutubeChapters(rows, null);
}

function unescapeYoutubeJsonString(raw: string): string {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseIso8601Duration(value: string): number | null {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const mins = Number(match[2] || 0);
  const secs = Number(match[3] || 0);
  return hours * 3600 + mins * 60 + secs;
}

async function fetchViaYoutubeDataApi(
  videoId: string,
  apiKey: string,
): Promise<{ description: string; durationSeconds: number | null } | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    items?: {
      snippet?: { description?: string };
      contentDetails?: { duration?: string };
    }[];
  };
  const item = data.items?.[0];
  if (!item) return null;

  return {
    description: String(item.snippet?.description ?? ""),
    durationSeconds: item.contentDetails?.duration
      ? parseIso8601Duration(item.contentDetails.duration)
      : null,
  };
}

async function fetchViaWatchPage(
  videoId: string,
): Promise<{ description: string; durationSeconds: number | null } | null> {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (compatible; MesaKitchenStudio/1.0; +https://mesakitchenstudio.com)",
    },
    next: { revalidate: 3600 },
  });
  if (!response.ok) return null;

  const html = await response.text();
  const descriptionMatch = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
  const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/);
  if (!descriptionMatch?.[1]) return null;

  return {
    description: unescapeYoutubeJsonString(descriptionMatch[1]),
    durationSeconds: lengthMatch?.[1] ? Number(lengthMatch[1]) : null,
  };
}

/** InnerTube player API — works from datacenter IPs when using the public WEB client + key. */
async function fetchViaInnerTube(
  videoId: string,
): Promise<{ description: string; durationSeconds: number | null } | null> {
  const innertubeKey =
    process.env.YOUTUBE_INNERTUBE_API_KEY?.trim() || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilhw_YGO_11w";
  const response = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${innertubeKey}&prettyPrint=false`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; MesaKitchenStudio/1.0; +https://mesakitchenstudio.com)",
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20250205.01.00",
            hl: "en",
            gl: "US",
          },
        },
      }),
      next: { revalidate: 3600 },
    },
  );
  if (!response.ok) return null;

  const data = (await response.json()) as {
    videoDetails?: { shortDescription?: string; lengthSeconds?: string };
  };

  const description = String(data.videoDetails?.shortDescription ?? "").trim();
  if (!description) return null;

  const lengthSeconds = data.videoDetails?.lengthSeconds;
  return {
    description,
    durationSeconds: lengthSeconds ? Number(lengthSeconds) : null,
  };
}

export async function fetchYoutubeVideoDescriptionMeta(
  videoId: string,
): Promise<{ description: string; durationSeconds: number | null } | null> {
  const trimmedId = videoId.trim();
  if (!trimmedId) return null;

  const candidates: { description: string; durationSeconds: number | null }[] = [];

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (apiKey) {
    const fromApi = await fetchViaYoutubeDataApi(trimmedId, apiKey);
    if (fromApi?.description.trim()) candidates.push(fromApi);
  }

  const fromInnerTube = await fetchViaInnerTube(trimmedId);
  if (fromInnerTube?.description.trim()) candidates.push(fromInnerTube);

  const fromWatch = await fetchViaWatchPage(trimmedId);
  if (fromWatch?.description.trim()) candidates.push(fromWatch);

  if (!candidates.length) return null;

  // Prefer the description that actually contains chapter timestamp lines.
  // Some sources (esp. short/truncated descriptions) omit the chapter block.
  let best = candidates[0];
  let bestChapterCount = parseYoutubeDescriptionChapters(best.description).length;
  for (const candidate of candidates.slice(1)) {
    const count = parseYoutubeDescriptionChapters(candidate.description).length;
    if (count > bestChapterCount) {
      best = candidate;
      bestChapterCount = count;
    } else if (count === bestChapterCount && candidate.description.length > best.description.length) {
      best = candidate;
    }
  }

  return best;
}

export function enrichYoutubeBlobFromDescription(input: {
  blob: Record<string, unknown> | null | undefined;
  description: string;
  durationSeconds?: number | null;
  aiChapters?: NormalizedAiYoutubeChapter[];
  confidenceByPath: Record<string, AiFieldAnnotation>;
  summary: RecipeAiMeta["summary"];
}): Record<string, unknown> | null {
  const blob = { ...(input.blob ?? {}) };
  const existingTimestamps = Array.isArray(blob.timestamps) ? blob.timestamps : [];
  const durationSeconds =
    input.durationSeconds ??
    (blob.duration ? parseTimestampInput(String(blob.duration)) : null);

  const descriptionChapters = parseYoutubeDescriptionChapters(input.description);
  const aiChapters =
    input.aiChapters ??
    chaptersFromBlobTimestamps(existingTimestamps, durationSeconds);

  const durationFromMeta =
    input.durationSeconds != null && input.durationSeconds > 0
      ? formatTimestampInput(input.durationSeconds)
      : "";

  if (!blob.duration && durationFromMeta) {
    blob.duration = durationFromMeta;
    input.confidenceByPath["values.youtube.duration"] = {
      confidence: "VERIFIED",
      sourceNote: "From YouTube video metadata",
    };
    tallyConfidence("VERIFIED", input.summary);
  }

  const merged = mergeRecipeYoutubeChapters({
    descriptionChapters,
    aiChapters,
    durationSeconds,
  });

  if (merged.length) {
    blob.timestamps = aiChaptersToTimestamps(merged);
    applyMergedChapterConfidence({
      chapters: merged,
      confidenceByPath: input.confidenceByPath,
      summary: input.summary,
    });
  }

  if (!blob.duration && !blob.timestamps && !blob.hook) return input.blob ?? null;
  return blob;
}

export async function enrichRecipeValuesYoutubeFromDescription(
  values: Record<string, unknown>,
): Promise<void> {
  const youtubeUrl = String(values.youtubeUrl ?? "").trim();
  const videoId = youtubeVideoId(youtubeUrl);
  if (!videoId) return;

  const rawYoutube = values.youtube;
  const currentBlob =
    rawYoutube && typeof rawYoutube === "object" && !Array.isArray(rawYoutube)
      ? (rawYoutube as Record<string, unknown>)
      : null;

  const hasTimestamps =
    Array.isArray(currentBlob?.timestamps) && currentBlob.timestamps.length > 0;
  if (hasTimestamps) return;

  const meta = await fetchYoutubeVideoDescriptionMeta(videoId);
  if (!meta?.description.trim()) return;

  const enriched = enrichYoutubeBlobFromDescription({
    blob: currentBlob,
    description: meta.description,
    durationSeconds: meta.durationSeconds,
    confidenceByPath: {},
    summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
  });

  if (enriched) {
    values.youtube = enriched;
  }
}

export async function enrichDraftYoutubeFromDescription(input: {
  values: Record<string, unknown>;
  videoId: string;
  confidenceByPath: Record<string, AiFieldAnnotation>;
  summary: RecipeAiMeta["summary"];
  aiChapters?: NormalizedAiYoutubeChapter[];
}): Promise<void> {
  const currentBlob =
    input.values.youtube && typeof input.values.youtube === "object" && !Array.isArray(input.values.youtube)
      ? (input.values.youtube as Record<string, unknown>)
      : null;

  const hasDuration = Boolean(String(currentBlob?.duration ?? "").trim());
  const meta = await fetchYoutubeVideoDescriptionMeta(input.videoId);
  if (!meta?.description.trim()) {
    if (hasDuration) return;
    return;
  }

  const durationSeconds =
    meta.durationSeconds ??
    (currentBlob?.duration ? parseTimestampInput(String(currentBlob.duration)) : null);

  const enriched = enrichYoutubeBlobFromDescription({
    blob: currentBlob,
    description: meta.description,
    durationSeconds,
    aiChapters: input.aiChapters,
    confidenceByPath: input.confidenceByPath,
    summary: input.summary,
  });

  if (enriched) {
    input.values.youtube = enriched;
  }
}

export type YoutubeChapterTimestamp = {
  time: number;
  label: string;
};

/**
 * Resolve chapter timestamps for a linked video.
 * Prefer synced YouTube Data (admin channel sync), then live description fetch.
 * Does not invent chapters and does not call Gemini.
 */
export async function loadYoutubeChapterTimestampsForVideo(
  videoId: string,
): Promise<{ timestamps: YoutubeChapterTimestamp[]; durationSeconds: number | null }> {
  const trimmedId = videoId.trim();
  if (!trimmedId) return { timestamps: [], durationSeconds: null };

  // 1) Synced YouTubeVideo.description from admin YouTube sync.
  try {
    const { getDb } = await import("@/lib/db");
    const video = await getDb().youTubeVideo.findUnique({
      where: { videoId: trimmedId },
      select: { description: true, durationSeconds: true },
    });
    if (video?.description.trim()) {
      const chapters = parseYoutubeDescriptionChapters(video.description);
      if (chapters.length) {
        return {
          timestamps: chapters.map((chapter) => ({
            time: chapter.time,
            label: chapter.label,
          })),
          durationSeconds: video.durationSeconds > 0 ? video.durationSeconds : null,
        };
      }
    }
  } catch {
    // DB unavailable in some local/test contexts — fall through.
  }

  // 2) Live description (Data API / InnerTube / watch page).
  try {
    const meta = await fetchYoutubeVideoDescriptionMeta(trimmedId);
    if (!meta?.description.trim()) {
      return { timestamps: [], durationSeconds: meta?.durationSeconds ?? null };
    }
    const chapters = parseYoutubeDescriptionChapters(meta.description);
    return {
      timestamps: chapters.map((chapter) => ({
        time: chapter.time,
        label: chapter.label,
      })),
      durationSeconds: meta.durationSeconds,
    };
  } catch {
    return { timestamps: [], durationSeconds: null };
  }
}
