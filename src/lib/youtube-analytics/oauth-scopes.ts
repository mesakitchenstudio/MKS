export const YT_ANALYTICS_SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

export function analyticsScopesAreSufficient(scopes: string): boolean {
  const granted = new Set(
    scopes
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
  return YT_ANALYTICS_SCOPES.every((required) => granted.has(required));
}
