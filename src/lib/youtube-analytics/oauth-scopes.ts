export const YT_ANALYTICS_SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

/** Least-privilege scope for videos.update snippet edits (description, title, tags, etc.). */
export const YT_WRITE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl" as const;

export const YT_CHAPTER_SYNC_SCOPES = [...YT_ANALYTICS_SCOPES, YT_WRITE_SCOPE] as const;

function grantedScopeSet(scopes: string): Set<string> {
  return new Set(
    scopes
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
}

export function analyticsScopesAreSufficient(scopes: string): boolean {
  const granted = grantedScopeSet(scopes);
  return YT_ANALYTICS_SCOPES.every((required) => granted.has(required));
}

export function chapterSyncWriteScopesAreSufficient(scopes: string): boolean {
  return analyticsScopesAreSufficient(scopes) && grantedScopeSet(scopes).has(YT_WRITE_SCOPE);
}

export function canReadYoutubeAnalytics(scopes: string): boolean {
  return analyticsScopesAreSufficient(scopes);
}

export function canWriteYoutubeVideoMetadata(scopes: string): boolean {
  return chapterSyncWriteScopesAreSufficient(scopes);
}
