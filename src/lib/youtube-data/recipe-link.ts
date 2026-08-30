import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";
import { aiChaptersToTimestamps } from "@/lib/ai-recipe/youtube-chapters";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { isRecipeAiVerified } from "@/lib/ai-recipe/field-tracking";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { youtubeVideoId, youtubeWatchUrl } from "@/lib/youtube";
import { youtubeMetadataToEditorState } from "@/lib/youtube-metadata-editor";

export type SyncedYoutubeVideo = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  durationDisplay: string;
  durationSeconds: number;
  publishedAt: Date | null;
  privacyStatus: string;
  embeddable: boolean;
  tags: string[];
};

export type MetadataSyncField = {
  key: string;
  label: string;
  current: string;
  next: string;
  skipReason?: string;
};

export function recipeLinkedVideoId(values: Record<string, unknown>): string | null {
  const fromUrl = youtubeVideoId(String(values.youtubeUrl ?? ""));
  if (fromUrl) return fromUrl;
  const blob = parseRecipeYoutubeBlob(values.youtube);
  if (blob?.videoId) return blob.videoId;
  if (blob?.url) return youtubeVideoId(blob.url);
  return null;
}

export function applyYoutubeVideoLinkToValues(
  values: Record<string, unknown>,
  video: SyncedYoutubeVideo,
): Record<string, unknown> {
  const watchUrl = youtubeWatchUrl(video.videoId) || `https://www.youtube.com/watch?v=${video.videoId}`;
  const existing = parseRecipeYoutubeBlob(values.youtube) ?? {};
  const next = {
    ...values,
    youtubeUrl: watchUrl,
    youtube: {
      ...existing,
      videoId: video.videoId,
      title: video.title,
      duration: video.durationDisplay,
      thumbnail: video.thumbnailUrl,
      url: watchUrl,
    },
  };
  return next;
}

export function clearYoutubeLinkFromValues(values: Record<string, unknown>): Record<string, unknown> {
  const next = { ...values };
  next.youtubeUrl = "";
  delete next.youtube;
  return next;
}

function fieldIsHumanProtected(path: string, aiMeta: RecipeAiMeta | null | undefined): boolean {
  if (isRecipeAiVerified(aiMeta)) return true;
  const provenance = aiMeta?.fieldProvenance?.[path];
  return Boolean(provenance?.humanModifiedAfterGeneration);
}

function hasSavedTimestamps(values: Record<string, unknown>): boolean {
  const blob = parseRecipeYoutubeBlob(values.youtube);
  return Boolean(blob?.timestamps?.length);
}

export function previewYoutubeMetadataSync(input: {
  values: Record<string, unknown>;
  aiMeta: RecipeAiMeta | null;
  video: SyncedYoutubeVideo;
}): MetadataSyncField[] {
  const { values, aiMeta, video } = input;
  const watchUrl = youtubeWatchUrl(video.videoId) || "";
  const blob = parseRecipeYoutubeBlob(values.youtube);
  const chapters = parseYoutubeDescriptionChapters(video.description);
  const changes: MetadataSyncField[] = [];

  const addChange = (key: string, label: string, current: string, next: string, skipReason?: string) => {
    if (current === next && !skipReason) return;
    changes.push({ key, label, current: current || "—", next: next || "—", skipReason });
  };

  addChange(
    "youtubeUrl",
    "Main YouTube URL",
    String(values.youtubeUrl ?? ""),
    watchUrl,
    fieldIsHumanProtected("values.youtubeUrl", aiMeta) ? "Human-edited field" : undefined,
  );

  addChange(
    "youtube.videoId",
    "Video ID",
    blob?.videoId ?? "",
    video.videoId,
  );

  addChange(
    "youtube.duration",
    "Duration",
    blob?.duration ?? "",
    video.durationDisplay,
    fieldIsHumanProtected("values.youtube.duration", aiMeta) ? "Human-edited field" : undefined,
  );

  addChange(
    "youtube.thumbnail",
    "Thumbnail URL",
    blob?.thumbnail ?? "",
    video.thumbnailUrl,
  );

  if (chapters.length) {
    const currentCount = blob?.timestamps?.length ?? 0;
    addChange(
      "youtube.timestamps",
      "Chapters",
      currentCount ? `${currentCount} saved chapter(s)` : "None",
      `${chapters.length} chapter(s) from YouTube description`,
      hasSavedTimestamps(values) || fieldIsHumanProtected("values.youtube.timestamps", aiMeta)
        ? "Existing saved chapters will be kept"
        : undefined,
    );
  }

  if (video.tags.length) {
    const currentTags = Array.isArray(values.tags)
      ? (values.tags as string[]).join(", ")
      : "";
    addChange(
      "tags",
      "Tags",
      currentTags || "None",
      video.tags.join(", "),
      (Array.isArray(values.tags) && values.tags.length > 0) ||
        fieldIsHumanProtected("values.tags", aiMeta)
        ? "Existing tags will be kept"
        : undefined,
    );
  }

  return changes;
}

export function applyYoutubeMetadataSync(input: {
  values: Record<string, unknown>;
  aiMeta: RecipeAiMeta | null;
  video: SyncedYoutubeVideo;
}): Record<string, unknown> {
  const linked = applyYoutubeVideoLinkToValues(input.values, input.video);
  if (isRecipeAiVerified(input.aiMeta)) {
    return linked;
  }

  const chapters = parseYoutubeDescriptionChapters(input.video.description);
  const blob = parseRecipeYoutubeBlob(linked.youtube) ?? {};
  const nextBlob = { ...blob };

  if (
    chapters.length &&
    !hasSavedTimestamps(linked) &&
    !fieldIsHumanProtected("values.youtube.timestamps", input.aiMeta)
  ) {
    nextBlob.timestamps = aiChaptersToTimestamps(chapters);
  }

  const next: Record<string, unknown> = { ...linked, youtube: nextBlob };

  if (
    input.video.tags.length &&
    (!Array.isArray(next.tags) || !(next.tags as string[]).length) &&
    !fieldIsHumanProtected("values.tags", input.aiMeta)
  ) {
    next.tags = [...input.video.tags];
  }

  return next;
}

export function syncedVideoToEditorPreview(video: SyncedYoutubeVideo) {
  return {
    videoId: video.videoId,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    durationDisplay: video.durationDisplay,
    publishedAt: video.publishedAt,
    privacyStatus: video.privacyStatus,
    embeddable: video.embeddable,
    watchUrl: youtubeWatchUrl(video.videoId) || "",
  };
}

export function valuesToYoutubeEditorState(values: Record<string, unknown>) {
  return youtubeMetadataToEditorState(parseRecipeYoutubeBlob(values.youtube));
}
