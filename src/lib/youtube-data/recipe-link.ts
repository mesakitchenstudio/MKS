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

export type HeroImageSource = NonNullable<RecipeAiMeta["heroImageSource"]>;

export function recipeLinkedVideoId(values: Record<string, unknown>): string | null {
  const fromUrl = youtubeVideoId(String(values.youtubeUrl ?? ""));
  if (fromUrl) return fromUrl;
  const blob = parseRecipeYoutubeBlob(values.youtube);
  if (blob?.videoId) return blob.videoId;
  if (blob?.url) return youtubeVideoId(blob.url);
  return null;
}

function currentHeroImage(values: Record<string, unknown>) {
  return String(values.image ?? "").trim();
}

/**
 * Resolve the synced YouTube thumbnail already stored on the recipe
 * (flat `youtube.thumbnail` or editor `youtube.preserved.thumbnail`).
 * Prefer this over inventing maxresdefault URLs.
 */
export function resolveLinkedYoutubeThumbnailUrl(values: Record<string, unknown>): string {
  const blob = parseRecipeYoutubeBlob(values.youtube);
  return String(blob?.thumbnail ?? "").trim();
}

/** True when Hero image is empty or still the auto-inherited YouTube thumbnail. */
export function shouldApplyYoutubeThumbnailAsHero(
  values: Record<string, unknown>,
  aiMeta: RecipeAiMeta | null | undefined,
  nextThumbnailUrl?: string,
): boolean {
  const current = currentHeroImage(values);
  if (!current) return true;

  if (aiMeta?.heroImageSource === "manual_upload" || aiMeta?.heroImageSource === "manual_url") {
    return false;
  }

  if (aiMeta?.heroImageSource === "youtube_thumbnail") return true;

  // Fallback when provenance is missing: treat image as inherited if it matches
  // the current YouTube blob thumbnail or the incoming video thumbnail.
  const linkedThumb = resolveLinkedYoutubeThumbnailUrl(values);
  if (linkedThumb && current === linkedThumb) return true;
  if (nextThumbnailUrl && current === nextThumbnailUrl.trim()) return true;

  return false;
}

/**
 * Populate Recipe.values.image from the synced video thumbnail when appropriate.
 * Never invents a URL — uses video.thumbnailUrl from YouTube sync (already best-available).
 */
export function applyHeroImageFromYoutubeVideo(
  values: Record<string, unknown>,
  video: SyncedYoutubeVideo,
  aiMeta?: RecipeAiMeta | null,
): { values: Record<string, unknown>; applied: boolean } {
  const thumbnailUrl = String(video.thumbnailUrl ?? "").trim();
  if (!thumbnailUrl) {
    return { values, applied: false };
  }

  if (!shouldApplyYoutubeThumbnailAsHero(values, aiMeta, thumbnailUrl)) {
    return { values, applied: false };
  }

  if (currentHeroImage(values) === thumbnailUrl) {
    // Idempotent: already set to this thumbnail.
    return { values: { ...values, image: thumbnailUrl }, applied: true };
  }

  return {
    values: { ...values, image: thumbnailUrl },
    applied: true,
  };
}

/**
 * If Hero image is empty, copy the linked YouTube thumbnail into values.image.
 * Never overwrites a non-empty hero (manual or otherwise). Does not invent URLs.
 */
export function fillEmptyHeroImageFromYoutubeThumbnail(
  values: Record<string, unknown>,
  aiMeta: RecipeAiMeta | null | undefined,
  options?: { syncedThumbnailUrl?: string; videoId?: string },
): {
  values: Record<string, unknown>;
  applied: boolean;
  aiMeta: RecipeAiMeta | null | undefined;
} {
  if (currentHeroImage(values)) {
    return { values, applied: false, aiMeta };
  }

  const thumbnailUrl =
    String(options?.syncedThumbnailUrl ?? "").trim() || resolveLinkedYoutubeThumbnailUrl(values);
  if (!thumbnailUrl) {
    return { values, applied: false, aiMeta };
  }

  const videoId =
    String(options?.videoId ?? "").trim() || recipeLinkedVideoId(values) || "";

  return {
    values: { ...values, image: thumbnailUrl },
    applied: true,
    aiMeta: videoId ? markHeroImageFromYoutube(aiMeta, videoId) : aiMeta,
  };
}

export function markHeroImageFromYoutube(
  aiMeta: RecipeAiMeta | null | undefined,
  videoId: string,
): RecipeAiMeta {
  if (!aiMeta) {
    return {
      generatedByAI: false,
      sourceType: "youtube",
      sourceUrl: "",
      generatedAt: "",
      model: "",
      schemaVersion: "",
      verificationStatus: "none",
      confidenceByPath: {},
      summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
      heroImageSource: "youtube_thumbnail",
      heroImageYoutubeVideoId: videoId,
    };
  }
  return {
    ...aiMeta,
    heroImageSource: "youtube_thumbnail",
    heroImageYoutubeVideoId: videoId,
  };
}

export function markHeroImageManual(
  aiMeta: RecipeAiMeta | null | undefined,
  imageUrl: string,
): RecipeAiMeta | null {
  const url = String(imageUrl ?? "").trim();
  if (!url) {
    if (!aiMeta) return null;
    const next = { ...aiMeta };
    delete next.heroImageSource;
    delete next.heroImageYoutubeVideoId;
    return next;
  }

  const isUpload =
    /blob\.vercel-storage\.com/i.test(url) ||
    /\/api\/.*upload/i.test(url) ||
    url.includes("public.blob.vercel-storage.com");

  const source: HeroImageSource = isUpload ? "manual_upload" : "manual_url";

  if (!aiMeta) {
    // Minimal meta so provenance survives save when recipe has no AI generation yet.
    return {
      generatedByAI: false,
      sourceType: "youtube",
      sourceUrl: "",
      generatedAt: "",
      model: "",
      schemaVersion: "",
      verificationStatus: "none",
      confidenceByPath: {},
      summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
      heroImageSource: source,
    };
  }

  return {
    ...aiMeta,
    heroImageSource: source,
    heroImageYoutubeVideoId: undefined,
  };
}

export function applyYoutubeVideoLinkToValues(
  values: Record<string, unknown>,
  video: SyncedYoutubeVideo,
  options?: { aiMeta?: RecipeAiMeta | null; applyHeroImage?: boolean },
): Record<string, unknown> {
  const watchUrl = youtubeWatchUrl(video.videoId) || `https://www.youtube.com/watch?v=${video.videoId}`;
  const existing = parseRecipeYoutubeBlob(values.youtube) ?? {};
  // Decide using pre-link values so Change video still replaces an inherited thumb.
  const shouldApplyHero =
    options?.applyHeroImage !== false &&
    shouldApplyYoutubeThumbnailAsHero(values, options?.aiMeta, video.thumbnailUrl);

  const youtubeBlob: Record<string, unknown> = {
    ...existing,
    videoId: video.videoId,
    title: video.title,
    duration: video.durationDisplay,
    thumbnail: video.thumbnailUrl,
    url: watchUrl,
  };

  // Import description chapters into the recipe mirror when missing / not human-locked.
  const descriptionChapters = parseYoutubeDescriptionChapters(video.description);
  if (
    descriptionChapters.length &&
    !chaptersAreHumanLocked(options?.aiMeta) &&
    !(existing.timestamps?.length ?? 0)
  ) {
    youtubeBlob.timestamps = aiChaptersToTimestamps(descriptionChapters);
  }

  const next: Record<string, unknown> = {
    ...values,
    youtubeUrl: watchUrl,
    youtube: youtubeBlob,
  };

  const thumbnailUrl = String(video.thumbnailUrl ?? "").trim();
  if (shouldApplyHero && thumbnailUrl) {
    next.image = thumbnailUrl;
  }

  return next;
}

export function clearYoutubeLinkFromValues(values: Record<string, unknown>): Record<string, unknown> {
  const next = { ...values };
  next.youtubeUrl = "";
  delete next.youtube;
  // Keep Hero image (including YouTube-inherited thumbnails).
  return next;
}

function fieldIsHumanProtected(path: string, aiMeta: RecipeAiMeta | null | undefined): boolean {
  if (isRecipeAiVerified(aiMeta)) return true;
  const provenance = aiMeta?.fieldProvenance?.[path];
  return Boolean(provenance?.humanModifiedAfterGeneration);
}

function chaptersAreHumanLocked(aiMeta: RecipeAiMeta | null | undefined): boolean {
  return Boolean(
    aiMeta?.fieldProvenance?.["values.youtube.timestamps"]?.humanModifiedAfterGeneration,
  );
}

export function markChaptersSyncedFromYoutube(
  aiMeta: RecipeAiMeta | null | undefined,
  chapterCount: number,
): RecipeAiMeta | null {
  if (!aiMeta || chapterCount <= 0) return aiMeta ?? null;
  return {
    ...aiMeta,
    confidenceByPath: {
      ...aiMeta.confidenceByPath,
      "values.youtube.timestamps": {
        confidence: "VERIFIED",
        sourceNote: "Synced from YouTube description",
      },
    },
  };
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

  const verified = isRecipeAiVerified(aiMeta);

  const heroCurrent = currentHeroImage(values);
  const heroNext = String(video.thumbnailUrl ?? "").trim();
  if (!heroCurrent && heroNext) {
    addChange("image", "Hero image", "None", "YouTube thumbnail");
  } else if (
    heroNext &&
    shouldApplyYoutubeThumbnailAsHero(values, aiMeta, heroNext) &&
    heroCurrent !== heroNext
  ) {
    addChange(
      "image",
      "Hero image",
      heroCurrent || "None",
      "YouTube thumbnail",
      verified ? "Verified recipe — Hero image will be kept" : undefined,
    );
  } else if (heroCurrent && heroNext && !shouldApplyYoutubeThumbnailAsHero(values, aiMeta, heroNext)) {
    addChange(
      "image",
      "Hero image",
      "Custom image",
      "YouTube thumbnail",
      "Custom Hero image will be kept",
    );
  }

  if (chapters.length) {
    const currentCount = blob?.timestamps?.length ?? 0;
    const humanLocked = chaptersAreHumanLocked(aiMeta);
    addChange(
      "youtube.timestamps",
      "Chapters",
      currentCount ? `${currentCount} saved chapter(s)` : "None",
      `${chapters.length} chapter(s) from YouTube description`,
      humanLocked ? "Human-edited chapters will be kept" : undefined,
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
      verified ||
        (Array.isArray(values.tags) && values.tags.length > 0) ||
        fieldIsHumanProtected("values.tags", aiMeta)
        ? verified
          ? "Verified recipe — tags will be kept"
          : "Existing tags will be kept"
        : undefined,
    );
  }

  return changes;
}

export function applyYoutubeMetadataSync(input: {
  values: Record<string, unknown>;
  aiMeta: RecipeAiMeta | null;
  video: SyncedYoutubeVideo;
  /**
   * Required for verified recipes before any recipe-stored YouTube metadata is updated.
   * Never clears verification. Never mutates editorial recipe content.
   */
  allowVerifiedRecipeUpdates?: boolean;
}): Record<string, unknown> {
  const verified = isRecipeAiVerified(input.aiMeta);

  // Verified recipes: never silently mutate recipe-stored fields.
  if (verified && !input.allowVerifiedRecipeUpdates) {
    return input.values;
  }

  if (verified) {
    // Explicit confirmation: refresh linked-video mirror fields only.
    // Do not touch custom hero, recipe tags, or editorial content.
    // YouTube description chapters are YouTube-owned and refresh unless human-locked.
    // Empty hero may still be filled from the refreshed synced thumbnail.
    const linked = applyYoutubeVideoLinkToValues(input.values, input.video, {
      aiMeta: input.aiMeta,
      applyHeroImage: false,
    });
    const withChapters = applySyncedDescriptionChaptersToValues(linked, input.video, input.aiMeta);
    return fillEmptyHeroImageFromYoutubeThumbnail(withChapters, input.aiMeta, {
      syncedThumbnailUrl: input.video.thumbnailUrl,
      videoId: input.video.videoId,
    }).values;
  }

  const linked = applyYoutubeVideoLinkToValues(input.values, input.video, {
    aiMeta: input.aiMeta,
    applyHeroImage: true,
  });

  const withChapters = applySyncedDescriptionChaptersToValues(linked, input.video, input.aiMeta);
  const next: Record<string, unknown> = { ...withChapters };

  if (
    input.video.tags.length &&
    (!Array.isArray(next.tags) || !(next.tags as string[]).length) &&
    !fieldIsHumanProtected("values.tags", input.aiMeta)
  ) {
    next.tags = [...input.video.tags];
  }

  // Safety: empty hero always picks up synced thumbnail when available.
  return fillEmptyHeroImageFromYoutubeThumbnail(next, input.aiMeta, {
    syncedThumbnailUrl: input.video.thumbnailUrl,
    videoId: input.video.videoId,
  }).values;
}

/**
 * Copy parsed YouTube description chapters into values.youtube.timestamps.
 * Skips when the editor has marked chapters as human-modified.
 * Does not clear existing chapters when the description currently has none.
 */
export function applySyncedDescriptionChaptersToValues(
  values: Record<string, unknown>,
  video: SyncedYoutubeVideo,
  aiMeta?: RecipeAiMeta | null,
): Record<string, unknown> {
  if (chaptersAreHumanLocked(aiMeta)) {
    return values;
  }

  const chapters = parseYoutubeDescriptionChapters(video.description);
  if (!chapters.length) return values;

  const blob = parseRecipeYoutubeBlob(values.youtube) ?? {};
  return {
    ...values,
    youtube: {
      ...blob,
      timestamps: aiChaptersToTimestamps(chapters),
    },
  };
}

/** Preview helper: whether applying refresh would mutate recipe-stored data. */
export function metadataSyncWouldMutateRecipe(
  fields: MetadataSyncField[],
): boolean {
  return fields.some((field) => !field.skipReason && field.current !== field.next);
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
