import type { ChapterSyncStatus } from "@/lib/youtube-chapter-sync/types";
import { canonicalChapterFingerprint, descriptionContentHash } from "@/lib/youtube-chapter-sync/fingerprints";
import { readChapterSyncMetadata } from "@/lib/youtube-chapter-sync/sync-metadata";
import type { YoutubeChapterExport } from "@/lib/youtube-chapter-sync/types";
import { normalizeInstructionGroups } from "@/lib/instruction-chapters";
import {
  analyticsScopesAreSufficient,
  chapterSyncWriteScopesAreSufficient,
} from "@/lib/youtube-analytics/oauth-scopes";

export function deriveChapterSyncStatus(input: {
  values: Record<string, unknown>;
  exportResult: YoutubeChapterExport;
  remoteDescription: string;
  oauthScopes: string;
  oauthConnected: boolean;
}): ChapterSyncStatus {
  if (!input.oauthConnected) {
    return "reconnect_required";
  }
  if (!analyticsScopesAreSufficient(input.oauthScopes)) {
    return "reconnect_required";
  }
  if (!chapterSyncWriteScopesAreSufficient(input.oauthScopes)) {
    return "reconnect_required";
  }
  if (!input.exportResult.ready) {
    return "not_youtube_ready";
  }

  const sync = readChapterSyncMetadata(input.values);
  const fingerprint = canonicalChapterFingerprint(normalizeInstructionGroups(input.values.instructions));
  const remoteHash = descriptionContentHash(input.remoteDescription);

  if (!sync) {
    return "ready_to_sync";
  }

  if (sync.videoId !== input.exportResult.videoId) {
    return "conflict";
  }

  if (sync.lastSyncedCanonicalFingerprint !== fingerprint) {
    return "mesa_changed";
  }

  if (sync.lastSyncedDescriptionHash && sync.lastSyncedDescriptionHash !== remoteHash) {
    return "youtube_changed";
  }

  if (sync.lastSyncedChapterBlock && input.remoteDescription.includes(sync.lastSyncedChapterBlock)) {
    return "in_sync";
  }

  return "ready_to_sync";
}
