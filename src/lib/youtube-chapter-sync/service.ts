import "server-only";
import { getDb } from "@/lib/db";
import { parseTimestampInput } from "@/lib/youtube-metadata-editor";
import { recipeLinkedVideoId } from "@/lib/youtube-data/recipe-link";
import {
  buildYoutubeChapterExport,
  DEFAULT_SYNTHETIC_INTRO_LABEL,
  mappedCanonicalSectionCount,
} from "@/lib/youtube-chapter-sync/export";
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
import {
  createChapterSyncPreviewToken,
  verifyChapterSyncPreviewToken,
} from "@/lib/youtube-chapter-sync/preview-token";
import { rebuildChapterSyncApplyPlan } from "@/lib/youtube-chapter-sync/apply-snapshot";
import {
  mergeChapterSyncMetadata,
  readChapterSyncMetadata,
  youtubeChapterSyncEnabled,
} from "@/lib/youtube-chapter-sync/sync-metadata";
import { deriveChapterSyncStatus } from "@/lib/youtube-chapter-sync/status";
import type { ChapterSyncPreviewOAuth } from "@/lib/youtube-chapter-sync/types";
import {
  getAnalyticsAccessToken,
  getAnalyticsConnectionPublic,
} from "@/lib/youtube-analytics/connection";
import {
  canReadYoutubeAnalytics,
  canWriteYoutubeVideoMetadata,
} from "@/lib/youtube-analytics/oauth-scopes";
import {
  fetchYoutubeVideoSnippetOAuth,
  updateYoutubeVideoDescriptionOAuth,
} from "@/lib/youtube-data/video-snippet-oauth";
import { YouTubeAnalyticsError } from "@/lib/youtube-analytics/errors";

function parseRecipeValues(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function videoDurationFromValues(values: Record<string, unknown>): number | undefined {
  const youtube = values.youtube;
  if (!youtube || typeof youtube !== "object" || Array.isArray(youtube)) return undefined;
  const blob = youtube as Record<string, unknown>;
  const preserved =
    blob.preserved && typeof blob.preserved === "object" && !Array.isArray(blob.preserved)
      ? (blob.preserved as Record<string, unknown>)
      : blob;
  const durationRaw = blob.duration ?? preserved.duration;
  if (typeof durationRaw === "number" && durationRaw > 0) return Math.floor(durationRaw);
  if (typeof durationRaw === "string" && durationRaw.trim()) {
    return parseTimestampInput(durationRaw) ?? undefined;
  }
  return undefined;
}

async function loadRecipe(recipeId: string) {
  const db = getDb();
  const recipe = await db.recipe.findUnique({
    where: { id: recipeId },
    select: { id: true, title: true, values: true },
  });
  if (!recipe) return null;
  return {
    id: recipe.id,
    title: recipe.title,
    values: parseRecipeValues(recipe.values),
  };
}

export async function buildChapterSyncOAuthStatus(origin: string): Promise<ChapterSyncPreviewOAuth> {
  const connection = await getAnalyticsConnectionPublic();
  const connected = connection.connected && connection.scopesSufficient;
  const canReadAnalytics = connected && canReadYoutubeAnalytics(connection.scopes);
  const canWrite = connected && canWriteYoutubeVideoMetadata(connection.scopes);
  const reconnectUrl = `${origin}/api/admin/youtube/analytics/oauth/start?write=1`;
  return {
    connected,
    canReadAnalytics,
    canWrite,
    writeScopeGranted: canWrite,
    reconnectUrl: canWrite ? undefined : reconnectUrl,
  };
}

export type ChapterSyncPreviewResult =
  | {
      ok: true;
      previewId: string;
      previewToken: string;
      videoId: string;
      videoTitle: string;
      export: ReturnType<typeof buildYoutubeChapterExport>;
      mappedSections: number;
      existingChapterBlock?: string;
      existingBlockLineCount?: number;
      replacementStrategy: string;
      beforeDescription: string;
      proposedDescription: string;
      beforeHash: string;
      proposedBytes: number;
      byteLimit: number;
      unchangedDescriptionBytes: number;
      chapterBlockBytes: number;
      syncStatus: string;
      oauth: ChapterSyncPreviewOAuth;
      introLabel: string;
    }
  | { ok: false; code: string; message: string };

export async function runChapterSyncPreview(input: {
  recipeId: string;
  origin: string;
  introLabel?: string;
}): Promise<ChapterSyncPreviewResult> {
  if (!youtubeChapterSyncEnabled()) {
    return {
      ok: false,
      code: "disabled",
      message: "YouTube chapter sync is not enabled in this environment.",
    };
  }

  const recipe = await loadRecipe(input.recipeId);
  if (!recipe) {
    return { ok: false, code: "not_found", message: "Recipe not found." };
  }

  const videoId = recipeLinkedVideoId(recipe.values);
  if (!videoId) {
    return { ok: false, code: "no_video", message: "This recipe has no linked YouTube video." };
  }

  const oauth = await buildChapterSyncOAuthStatus(input.origin);
  const duration = videoDurationFromValues(recipe.values);
  const syncMeta = readChapterSyncMetadata(recipe.values);

  let remoteDescription = "";
  let remoteEtag: string | null = null;
  let videoTitle = recipe.title;

  if (oauth.canWrite) {
    try {
      const { accessToken } = await getAnalyticsAccessToken();
      const remote = await fetchYoutubeVideoSnippetOAuth(accessToken, videoId);
      if (!remote) {
        return { ok: false, code: "video_not_found", message: "Linked YouTube video was not found." };
      }
      remoteDescription = remote.snippet.description;
      remoteEtag = remote.etag ?? null;
      videoTitle = remote.snippet.title || videoTitle;
    } catch (error) {
      const message =
        error instanceof YouTubeAnalyticsError
          ? error.message
          : "Could not fetch the live YouTube description.";
      return { ok: false, code: "fetch_failed", message };
    }
  } else {
    const { fetchYoutubeVideoDescriptionMeta } = await import("@/lib/youtube-description");
    const meta = await fetchYoutubeVideoDescriptionMeta(videoId);
    if (!meta) {
      return {
        ok: false,
        code: "fetch_failed",
        message: "Could not fetch the YouTube video description.",
      };
    }
    remoteDescription = meta.description;
  }

  const introLabel =
    input.introLabel?.trim() ||
    (() => {
      const exportProbe = buildYoutubeChapterExport({
        videoId,
        instructions: recipe.values.instructions,
        videoDurationSeconds: duration,
        remoteDescription,
      });
      const synthetic = exportProbe.items.find((item) => item.source === "synthetic_intro");
      return synthetic?.label ?? DEFAULT_SYNTHETIC_INTRO_LABEL;
    })();

  const exportResult = buildYoutubeChapterExport({
    videoId,
    instructions: recipe.values.instructions,
    videoDurationSeconds: duration,
    introLabel,
    remoteDescription,
  });

  const patch = buildDescriptionPatchPlan({
    currentDescription: remoteDescription,
    exportItems: exportResult.items,
    lastSyncedChapterBlock: syncMeta?.lastSyncedChapterBlock,
  });

  const bytesCheck = validateProposedDescriptionBytes(patch.proposedDescription);
  const connection = await getAnalyticsConnectionPublic();
  const syncStatus = deriveChapterSyncStatus({
    values: recipe.values,
    exportResult,
    remoteDescription,
    oauthScopes: connection.scopes,
    oauthConnected: connection.connected,
  });

  const beforeHash = descriptionContentHash(remoteDescription);
  const fingerprint = canonicalChapterFingerprint(
    (await import("@/lib/instruction-chapters")).normalizeInstructionGroups(
      recipe.values.instructions,
    ),
  );

  const { previewId, previewToken } = createChapterSyncPreviewToken({
    recipeId: recipe.id,
    videoId,
    introLabel,
    beforeHash,
    remoteEtag,
    canonicalFingerprint: fingerprint,
    exportFingerprint: youtubeExportFingerprint(introLabel, exportResult.items),
    replacementStrategy: patch.strategy,
    replacementBlockHash: chapterBlockHash(patch.existingChapterBlock ?? ""),
  });

  return {
    ok: true,
    previewId,
    previewToken,
    videoId,
    videoTitle,
    export: exportResult,
    mappedSections: mappedCanonicalSectionCount(recipe.values.instructions),
    existingChapterBlock: patch.existingChapterBlock,
    existingBlockLineCount: patch.existingBlockLineCount,
    replacementStrategy: patch.strategy,
    beforeDescription: patch.beforeDescription,
    proposedDescription: patch.proposedDescription,
    beforeHash,
    proposedBytes: patch.proposedBytes,
    byteLimit: bytesCheck.limit,
    unchangedDescriptionBytes: patch.unchangedDescriptionBytes,
    chapterBlockBytes: patch.chapterBlockBytes,
    syncStatus,
    oauth,
    introLabel,
    ...(bytesCheck.ok ? {} : { byteError: bytesCheck.message }),
  } as ChapterSyncPreviewResult & { byteError?: string };
}

export type ChapterSyncApplyResult =
  | {
      ok: true;
      status: "synced" | "already_in_sync";
      videoId: string;
      videoTitle: string;
      lastSyncedAt: string;
      verified: boolean;
      metadataStored: boolean;
      warning?: string;
    }
  | { ok: false; code: string; message: string };

export async function runChapterSyncApply(input: {
  recipeId: string;
  previewToken: string;
  adminId: string;
  adminLabel: string;
}): Promise<ChapterSyncApplyResult> {
  const logBase = { recipeId: input.recipeId, stage: "start" as string, videoId: "" };

  if (!youtubeChapterSyncEnabled()) {
    console.info("[chapter-sync-apply]", { ...logBase, stage: "disabled" });
    return {
      ok: false,
      code: "disabled",
      message: "YouTube chapter sync is not enabled in this environment.",
    };
  }

  const verified = verifyChapterSyncPreviewToken(input.previewToken);
  if (!verified.ok) {
    console.info("[chapter-sync-apply]", { ...logBase, stage: "preview_invalid" });
    return { ok: false, code: "preview_invalid", message: verified.reason };
  }
  const snapshot = verified.payload;
  logBase.videoId = snapshot.videoId;
  if (snapshot.recipeId !== input.recipeId) {
    console.info("[chapter-sync-apply]", { ...logBase, stage: "preview_mismatch" });
    return { ok: false, code: "preview_mismatch", message: "Preview does not match this recipe." };
  }

  const recipe = await loadRecipe(input.recipeId);
  if (!recipe) {
    console.info("[chapter-sync-apply]", { ...logBase, stage: "not_found" });
    return { ok: false, code: "not_found", message: "Recipe not found." };
  }

  const videoId = recipeLinkedVideoId(recipe.values);
  if (!videoId || videoId !== snapshot.videoId) {
    console.info("[chapter-sync-apply]", { ...logBase, stage: "video_changed", videoId: videoId ?? "" });
    return {
      ok: false,
      code: "video_changed",
      message: "The linked YouTube video changed after this preview was generated.",
    };
  }

  const connection = await getAnalyticsConnectionPublic();
  if (!canWriteYoutubeVideoMetadata(connection.scopes)) {
    console.info("[chapter-sync-apply]", { ...logBase, stage: "oauth_write_denied" });
    return {
      ok: false,
      code: "oauth_write",
      message:
        "YouTube is connected, but description editing permission was not granted. Reconnect and allow Mesa to update YouTube video descriptions.",
    };
  }

  let accessToken: string;
  try {
    ({ accessToken } = await getAnalyticsAccessToken());
  } catch (error) {
    console.info("[chapter-sync-apply]", { ...logBase, stage: "oauth_error" });
    const message =
      error instanceof YouTubeAnalyticsError
        ? error.message
        : "YouTube authorization is unavailable.";
    return { ok: false, code: "oauth_error", message };
  }

  const remote = await fetchYoutubeVideoSnippetOAuth(accessToken, videoId);
  if (!remote) {
    console.info("[chapter-sync-apply]", { ...logBase, stage: "video_not_found" });
    return { ok: false, code: "video_not_found", message: "Linked YouTube video was not found." };
  }

  const duration = videoDurationFromValues(recipe.values);
  const syncMeta = readChapterSyncMetadata(recipe.values);
  const rebuilt = rebuildChapterSyncApplyPlan({
    snapshot,
    instructions: recipe.values.instructions,
    videoDurationSeconds: duration,
    remoteDescription: remote.snippet.description,
    lastSyncedChapterBlock: syncMeta?.lastSyncedChapterBlock,
  });

  if (!rebuilt.ok) {
    console.info("[chapter-sync-apply]", {
      ...logBase,
      stage: "rebuild_failed",
      code: rebuilt.code,
    });
    return { ok: false, code: rebuilt.code, message: rebuilt.message };
  }

  if (rebuilt.patchStrategy === "already_in_sync") {
    console.info("[chapter-sync-apply]", {
      ...logBase,
      stage: "already_in_sync",
      videosUpdateReached: false,
    });
    return {
      ok: true,
      status: "already_in_sync",
      videoId,
      videoTitle: remote.snippet.title,
      lastSyncedAt: syncMeta?.lastSyncedAt ?? new Date().toISOString(),
      verified: true,
      metadataStored: Boolean(syncMeta),
    };
  }

  console.info("[chapter-sync-apply]", { ...logBase, stage: "videos_update_start" });
  let updated: Awaited<ReturnType<typeof updateYoutubeVideoDescriptionOAuth>>;
  try {
    updated = await updateYoutubeVideoDescriptionOAuth({
      accessToken,
      video: remote,
      nextDescription: rebuilt.proposedDescription,
    });
  } catch (error) {
    console.info("[chapter-sync-apply]", {
      ...logBase,
      stage: "videos_update_failed",
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      code: "youtube_rejected",
      message: "YouTube rejected the update.",
    };
  }
  console.info("[chapter-sync-apply]", { ...logBase, stage: "videos_update_complete" });

  const verifiedRemote = await fetchYoutubeVideoSnippetOAuth(accessToken, videoId);
  const descriptionMatches =
    verifiedRemote?.snippet.description === rebuilt.proposedDescription;
  const titleUnchanged = verifiedRemote?.snippet.title === remote.snippet.title;
  const categoryUnchanged = verifiedRemote?.snippet.categoryId === remote.snippet.categoryId;
  const tagsUnchanged =
    JSON.stringify(verifiedRemote?.snippet.tags ?? []) ===
    JSON.stringify(remote.snippet.tags ?? []);

  if (!descriptionMatches) {
    console.info("[chapter-sync-apply]", {
      ...logBase,
      stage: "verify_failed",
      videosUpdateReached: true,
      postWriteVerificationPassed: false,
    });
    return {
      ok: false,
      code: "verify_failed",
      message:
        "YouTube accepted the update but the returned description did not match the expected value.",
    };
  }

  const fingerprint = canonicalChapterFingerprint(
    (await import("@/lib/instruction-chapters")).normalizeInstructionGroups(
      recipe.values.instructions,
    ),
  );
  const metadata = {
    videoId,
    lastSyncedAt: new Date().toISOString(),
    lastSyncedBy: input.adminLabel,
    lastSyncedDescriptionHash: descriptionContentHash(rebuilt.proposedDescription),
    lastSyncedChapterBlock: rebuilt.generatedChapterBlock,
    lastSyncedCanonicalFingerprint: fingerprint,
    remoteEtag: verifiedRemote?.etag ?? updated.etag,
  };

  let metadataStored = true;
  try {
    const nextValues = mergeChapterSyncMetadata(recipe.values, metadata);
    const db = getDb();
    await db.recipe.update({
      where: { id: recipe.id },
      data: { values: JSON.stringify(nextValues) },
    });
  } catch {
    metadataStored = false;
  }

  console.info("[chapter-sync-apply]", {
    ...logBase,
    stage: "complete",
    videosUpdateReached: true,
    postWriteVerificationPassed: true,
    metadataStored,
  });

  const warning =
    !metadataStored
      ? "YouTube was updated successfully, but Mesa could not record the sync status."
      : !titleUnchanged || !categoryUnchanged || !tagsUnchanged
        ? "YouTube description updated; verify title, category, or tags in YouTube Studio if needed."
        : undefined;

  return {
    ok: true,
    status: "synced",
    videoId,
    videoTitle: remote.snippet.title,
    lastSyncedAt: metadata.lastSyncedAt,
    verified: descriptionMatches,
    metadataStored,
    warning,
  };
}
