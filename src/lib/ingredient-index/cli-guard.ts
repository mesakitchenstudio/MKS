/**
 * Safe DB target description for ingredient operator CLIs.
 * Never prints credentials or full DATABASE_URL.
 */
export function describeDatabaseTarget(): string {
  if (process.env.VERCEL) {
    const url = process.env.DATABASE_URL?.trim() ?? "";
    let host = "(unknown)";
    let database = "(unknown)";
    try {
      const parsed = new URL(url);
      host = parsed.hostname || host;
      database = parsed.pathname.replace(/^\//, "") || database;
    } catch {
      /* keep placeholders */
    }
    return [
      "Database target: VERCEL / remote",
      `Host (redacted): ${host}`,
      `Database: ${database}`,
      "Warning: this is not the local SQLite workspace DB.",
    ].join("\n");
  }

  return [
    "Database target: local SQLite (prisma/dev.db via getDb)",
    "Production Neon: NOT used by default in this workspace.",
  ].join("\n");
}
