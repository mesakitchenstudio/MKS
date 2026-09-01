import { buildYoutubeChapterExport } from "@/lib/youtube-chapter-sync/export";
import {
  buildDescriptionPatchPlan,
  validateProposedDescriptionBytes,
} from "@/lib/youtube-chapter-sync/description-patch";
import {
  canonicalChapterFingerprint,
  chapterBlockHash,
  descriptionContentHash,
  youtubeExportFingerprint,
} from "@/lib/youtube-chapter-sync/fingerprints";
import { normalizeInstructionGroups } from "@/lib/instruction-chapters";
import type { ChapterSyncPreviewPayload } from "@/lib/youtube-chapter-sync/preview-token";

export type RebuiltApplyPlan =
  | {
      ok: true;
      proposedDescription: string;
      generatedChapterBlock: string;
      patchStrategy: string;
    }
  | { ok: false; code: string; message: string };

/**
 * Rebuild the apply payload from a verified preview snapshot and current server data.
 * Does not call YouTube — validation only.
 */
export function rebuildChapterSyncApplyPlan(input: {
  snapshot: ChapterSyncPreviewPayload;
  instructions: unknown;
  videoDurationSeconds?: number;
  remoteDescription: string;
  lastSyncedChapterBlock?: string;
}): RebuiltApplyPlan {
  const fingerprint = canonicalChapterFingerprint(normalizeInstructionGroups(input.instructions));
  if (fingerprint !== input.snapshot.canonicalFingerprint) {
    return {
      ok: false,
      code: "canonical_changed",
      message:
        "Mesa chapters changed after this preview was generated. Generate a new preview.",
    };
  }

  const remoteHash = descriptionContentHash(input.remoteDescription);
  if (remoteHash !== input.snapshot.beforeHash) {
    return {
      ok: false,
      code: "remote_drift",
      message:
        "The YouTube description changed after this preview was generated. Refresh the preview before updating.",
    };
  }

  const exportResult = buildYoutubeChapterExport({
    videoId: input.snapshot.videoId,
    instructions: input.instructions,
    videoDurationSeconds: input.videoDurationSeconds,
    introLabel: input.snapshot.introLabel,
    remoteDescription: input.remoteDescription,
  });

  const exportFingerprint = youtubeExportFingerprint(input.snapshot.introLabel, exportResult.items);
  if (exportFingerprint !== input.snapshot.exportFingerprint) {
    return {
      ok: false,
      code: "export_changed",
      message: "Chapter export changed after this preview was generated. Generate a new preview.",
    };
  }

  if (!exportResult.ready) {
    return {
      ok: false,
      code: "not_ready",
      message: exportResult.errors[0]?.message ?? "YouTube export is not ready.",
    };
  }

  const patch = buildDescriptionPatchPlan({
    currentDescription: input.remoteDescription,
    exportItems: exportResult.items,
    lastSyncedChapterBlock: input.lastSyncedChapterBlock,
  });

  if (patch.strategy !== input.snapshot.replacementStrategy) {
    return {
      ok: false,
      code: "strategy_changed",
      message:
        "The description layout changed after this preview was generated. Generate a new preview.",
    };
  }

  const replacementBlockHash = chapterBlockHash(patch.existingChapterBlock ?? "");
  if (replacementBlockHash !== input.snapshot.replacementBlockHash) {
    return {
      ok: false,
      code: "block_changed",
      message:
        "The replaceable chapter block changed after this preview was generated. Generate a new preview.",
    };
  }

  if (patch.strategy === "ambiguous") {
    return {
      ok: false,
      code: "ambiguous",
      message:
        "Mesa found multiple possible timestamp sections and will not choose automatically.",
    };
  }

  const bytesCheck = validateProposedDescriptionBytes(patch.proposedDescription);
  if (!bytesCheck.ok) {
    return {
      ok: false,
      code: "byte_limit",
      message: bytesCheck.message ?? "Description too large.",
    };
  }

  if (patch.strategy === "already_in_sync") {
    return {
      ok: true,
      proposedDescription: patch.proposedDescription,
      generatedChapterBlock: patch.generatedChapterBlock,
      patchStrategy: patch.strategy,
    };
  }

  return {
    ok: true,
    proposedDescription: patch.proposedDescription,
    generatedChapterBlock: patch.generatedChapterBlock,
    patchStrategy: patch.strategy,
  };
}
