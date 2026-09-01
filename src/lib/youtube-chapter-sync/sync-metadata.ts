import type { YoutubeChapterSyncMetadata } from "@/lib/youtube-chapter-sync/types";

export function readChapterSyncMetadata(
  values: Record<string, unknown>,
): YoutubeChapterSyncMetadata | null {
  const youtube = values.youtube;
  if (!youtube || typeof youtube !== "object" || Array.isArray(youtube)) return null;
  const blob = youtube as Record<string, unknown>;
  const preserved =
    blob.preserved && typeof blob.preserved === "object" && !Array.isArray(blob.preserved)
      ? (blob.preserved as Record<string, unknown>)
      : blob;
  const sync = preserved.chapterSync;
  if (!sync || typeof sync !== "object" || Array.isArray(sync)) return null;
  const row = sync as Record<string, unknown>;
  const videoId = String(row.videoId ?? "").trim();
  const lastSyncedAt = String(row.lastSyncedAt ?? "").trim();
  const lastSyncedBy = String(row.lastSyncedBy ?? "").trim();
  const lastSyncedDescriptionHash = String(row.lastSyncedDescriptionHash ?? "").trim();
  const lastSyncedChapterBlock = String(row.lastSyncedChapterBlock ?? "");
  const lastSyncedCanonicalFingerprint = String(row.lastSyncedCanonicalFingerprint ?? "").trim();
  if (!videoId || !lastSyncedAt || !lastSyncedCanonicalFingerprint) return null;
  return {
    videoId,
    lastSyncedAt,
    lastSyncedBy,
    lastSyncedDescriptionHash,
    lastSyncedChapterBlock,
    lastSyncedCanonicalFingerprint,
    remoteEtag: row.remoteEtag ? String(row.remoteEtag) : undefined,
  };
}

export function mergeChapterSyncMetadata(
  values: Record<string, unknown>,
  metadata: YoutubeChapterSyncMetadata,
): Record<string, unknown> {
  const next = { ...values };
  const existingYoutube =
    next.youtube && typeof next.youtube === "object" && !Array.isArray(next.youtube)
      ? ({ ...(next.youtube as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const preserved =
    existingYoutube.preserved &&
    typeof existingYoutube.preserved === "object" &&
    !Array.isArray(existingYoutube.preserved)
      ? ({ ...(existingYoutube.preserved as Record<string, unknown>) } as Record<string, unknown>)
      : extractNonStructuredPreserved(existingYoutube);

  preserved.chapterSync = metadata;

  const structuredKeys = new Set([
    "hook",
    "sectionDescription",
    "duration",
    "playlistUrl",
    "playlistLabel",
    "timestamps",
    "relatedVideos",
    "relatedYoutubeVideos",
    "stageAlignments",
  ]);

  const youtubeOut: Record<string, unknown> = { preserved };
  for (const [key, value] of Object.entries(existingYoutube)) {
    if (key === "preserved") continue;
    if (structuredKeys.has(key)) {
      youtubeOut[key] = value;
    } else if (!structuredKeys.has(key)) {
      if (!(key in preserved)) {
        preserved[key] = value;
      }
    }
  }

  next.youtube = youtubeOut;
  return next;
}

function extractNonStructuredPreserved(blob: Record<string, unknown>): Record<string, unknown> {
  const structuredKeys = new Set([
    "hook",
    "sectionDescription",
    "duration",
    "playlistUrl",
    "playlistLabel",
    "timestamps",
    "relatedVideos",
    "relatedYoutubeVideos",
    "stageAlignments",
    "preserved",
  ]);
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(blob)) {
    if (!structuredKeys.has(key)) {
      preserved[key] = value;
    }
  }
  return preserved;
}

export function youtubeChapterSyncEnabled() {
  return process.env.YOUTUBE_CHAPTER_SYNC_ENABLED === "true";
}
