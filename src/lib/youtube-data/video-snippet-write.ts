/**
 * Writable snippet fields for YouTube Data API videos.update(part=snippet).
 *
 * Per https://developers.google.com/youtube/v3/docs/videos/update the snippet part
 * accepts: title (required), categoryId (required), description, tags, defaultLanguage.
 *
 * NOT writable via snippet update (read-only / server-derived — do not send):
 * - channelId, channelTitle, publishedAt, thumbnails, localized
 * - defaultAudioLanguage (returned by videos.list but not in the update property list)
 * - liveBroadcastContent, customUrl, etc.
 */
export type WritableYoutubeVideoSnippet = {
  title: string;
  categoryId: string;
  description: string;
  tags?: string[];
  defaultLanguage?: string;
};

export type YoutubeVideoSnippetReadModel = WritableYoutubeVideoSnippet & {
  /** Read-only from videos.list — preserved by omission on update, never sent. */
  defaultAudioLanguage?: string;
};

export type YoutubeVideoSnippetRecord = {
  id: string;
  etag?: string;
  snippet: YoutubeVideoSnippetReadModel;
};

/**
 * Build the exact payload for videos.update(part=snippet).
 * Preserves current writable values; changes only description.
 */
export function buildWritableVideoSnippet(
  current: WritableYoutubeVideoSnippet,
  newDescription: string,
): WritableYoutubeVideoSnippet {
  const snippet: WritableYoutubeVideoSnippet = {
    title: current.title,
    categoryId: current.categoryId,
    description: newDescription,
  };
  if (current.tags !== undefined) {
    snippet.tags = [...current.tags];
  }
  if (current.defaultLanguage) {
    snippet.defaultLanguage = current.defaultLanguage;
  }
  return snippet;
}

export function parseYoutubeSnippetReadModel(
  raw: Record<string, unknown>,
): YoutubeVideoSnippetReadModel {
  const snippet: YoutubeVideoSnippetReadModel = {
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    categoryId: String(raw.categoryId ?? ""),
  };
  if (Array.isArray(raw.tags) && raw.tags.length > 0) {
    snippet.tags = raw.tags.map(String);
  }
  if (raw.defaultLanguage) {
    snippet.defaultLanguage = String(raw.defaultLanguage);
  }
  if (raw.defaultAudioLanguage) {
    snippet.defaultAudioLanguage = String(raw.defaultAudioLanguage);
  }
  return snippet;
}
