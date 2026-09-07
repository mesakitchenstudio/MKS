/** Least-privilege Search Console read scope. */
export const SEARCH_CONSOLE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
] as const;

export function searchConsoleScopesAreSufficient(scopes: string): boolean {
  const granted = new Set(
    String(scopes || "")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return SEARCH_CONSOLE_SCOPES.every((scope) => granted.has(scope));
}
