/**
 * Safe database-target classification for operator CLIs and getDb().
 * Classification is driven by DATABASE_URL scheme — never by VERCEL alone.
 */

export type DatabaseProvider = "sqlite" | "postgresql" | "unknown";

export type DatabaseTargetInfo = {
  provider: DatabaseProvider;
  isRemote: boolean;
  /** True when operator/Production mode is active AND target is PostgreSQL. */
  isProductionLike: boolean;
  host?: string;
  databaseName?: string;
  sourceDescription: string;
  urlPresent: boolean;
};

type EnvLike = Record<string, string | undefined>;

/** Explicit Production/operator write context (not mere VERCEL=1). */
export function isIngredientOperatorProductionMode(env: EnvLike = process.env): boolean {
  return (
    env.VERCEL_ENV === "production" || env.INGREDIENT_OPERATOR_PRODUCTION === "1"
  );
}

/**
 * Classify a raw connection string by scheme only.
 * Never returns credentials. Malformed / missing → unknown.
 */
export function classifyDatabaseUrl(
  rawUrl: string | undefined | null,
): Pick<DatabaseTargetInfo, "provider" | "host" | "databaseName" | "urlPresent"> {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) {
    return { provider: "unknown", urlPresent: false };
  }

  if (trimmed.startsWith("file:")) {
    let databaseName = trimmed.slice("file:".length);
    try {
      const asUrl = new URL(trimmed);
      const pathPart = decodeURIComponent(asUrl.pathname || "").replace(/^\/+/, "");
      databaseName = pathPart || databaseName;
    } catch {
      /* keep raw path fragment */
    }
    const base = databaseName.split(/[/\\]/).filter(Boolean).pop() || databaseName;
    return {
      provider: "sqlite",
      databaseName: base || "dev.db",
      urlPresent: true,
    };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("postgresql:") || lower.startsWith("postgres:")) {
    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname) {
        return { provider: "unknown", urlPresent: true };
      }
      const databaseName = parsed.pathname.replace(/^\//, "") || undefined;
      return {
        provider: "postgresql",
        host: parsed.hostname,
        databaseName,
        urlPresent: true,
      };
    } catch {
      return { provider: "unknown", urlPresent: true };
    }
  }

  return { provider: "unknown", urlPresent: true };
}

/**
 * URL getDb() would use for this env.
 * Local (no VERCEL): prisma/dev.db file URL.
 * VERCEL set: process.env.DATABASE_URL (required for open; may be empty for classify).
 */
export function resolveOperatorDatabaseUrl(env: EnvLike = process.env): string {
  if (env.VERCEL) {
    const url = env.DATABASE_URL?.trim() ?? "";
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set while VERCEL is set. Refusing to open a database.",
      );
    }
    return url;
  }
  // Keep scheme/path shape aligned with getDb() sqlite target for banners.
  return "file:prisma/dev.db";
}

export function getDatabaseTargetInfo(env: EnvLike = process.env): DatabaseTargetInfo {
  const productionMode = isIngredientOperatorProductionMode(env);

  if (env.VERCEL) {
    const raw = env.DATABASE_URL?.trim();
    if (!raw) {
      return {
        provider: "unknown",
        isRemote: false,
        isProductionLike: false,
        sourceDescription: "DATABASE_URL missing while VERCEL is set",
        urlPresent: false,
      };
    }
    const classified = classifyDatabaseUrl(raw);
    return finalizeTargetInfo(classified, env, productionMode);
  }

  // Non-VERCEL: getDb() always opens local SQLite regardless of DATABASE_URL.
  const classified = classifyDatabaseUrl("file:prisma/dev.db");
  return finalizeTargetInfo(classified, env, productionMode);
}

function finalizeTargetInfo(
  classified: ReturnType<typeof classifyDatabaseUrl>,
  env: EnvLike,
  productionMode: boolean,
): DatabaseTargetInfo {
  const isRemote = classified.provider === "postgresql";
  const isProductionLike = productionMode && classified.provider === "postgresql";

  let sourceDescription: string;
  if (classified.provider === "sqlite") {
    sourceDescription = env.VERCEL
      ? "SQLite file URL while VERCEL is set (NOT Production Postgres)"
      : "local SQLite (prisma/dev.db via getDb)";
  } else if (classified.provider === "postgresql") {
    sourceDescription = productionMode
      ? "PostgreSQL (Production/operator mode)"
      : env.VERCEL
        ? "PostgreSQL (VERCEL shell; not Production mode unless VERCEL_ENV=production)"
        : "PostgreSQL (operator shell)";
  } else {
    sourceDescription = "unsupported or malformed DATABASE_URL";
  }

  return {
    provider: classified.provider,
    isRemote,
    isProductionLike,
    host: classified.host,
    databaseName: classified.databaseName,
    sourceDescription,
    urlPresent: classified.urlPresent,
  };
}

/** Human-readable banner for Ingredient CLIs. Never includes credentials or full URL. */
export function describeDatabaseTarget(env: EnvLike = process.env): string {
  const info = getDatabaseTargetInfo(env);
  const lines: string[] = ["Database target:"];

  if (info.provider === "sqlite") {
    lines.push("Provider: SQLite");
    lines.push(`File: ${info.databaseName || "dev.db"}`);
    lines.push("Production: NO");
    lines.push(`Context: ${info.sourceDescription}`);
    if (env.VERCEL) {
      lines.push(
        "Warning: VERCEL is set but DATABASE_URL is a file: URL — this is local SQLite, not Neon.",
      );
    }
  } else if (info.provider === "postgresql") {
    lines.push("Provider: PostgreSQL");
    lines.push(`Host: ${info.host || "(unknown)"}`);
    lines.push(`Database: ${info.databaseName || "(unknown)"}`);
    lines.push(
      `Production operator context: ${info.isProductionLike ? "YES" : "NO"}`,
    );
    lines.push(`Context: ${info.sourceDescription}`);
  } else {
    lines.push("Provider: UNKNOWN");
    lines.push(`Context: ${info.sourceDescription}`);
    lines.push("Production: NO");
  }

  return lines.join("\n");
}

/**
 * Hard-stop for Production/operator mutating Ingredient CLIs.
 * Local SQLite seed/backfill remain allowed when Production mode is OFF.
 */
export function assertIngredientOperatorWriteTargetSafe(
  env: EnvLike = process.env,
): DatabaseTargetInfo {
  const info = getDatabaseTargetInfo(env);
  if (!isIngredientOperatorProductionMode(env)) {
    return info;
  }
  if (info.provider !== "postgresql") {
    throw new Error(
      [
        "Ingredient Production/operator write refused: DATABASE_URL must be postgres/postgresql.",
        `Detected provider: ${info.provider}`,
        info.databaseName ? `Database label: ${info.databaseName}` : "",
        "VERCEL alone is not proof of Production Postgres.",
        "Set a real Production DATABASE_URL (or unset VERCEL_ENV=production / INGREDIENT_OPERATOR_PRODUCTION).",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  return info;
}

/**
 * Called from getDb() when Production/operator mode is active.
 * Prevents opening SQLite under a Production-labelled shell.
 */
export function assertProductionOperatorDatabaseUrl(
  url: string,
  env: EnvLike = process.env,
): void {
  if (!isIngredientOperatorProductionMode(env)) return;
  const classified = classifyDatabaseUrl(url);
  if (classified.provider !== "postgresql") {
    throw new Error(
      [
        "Refusing to create Prisma client in Production/operator mode:",
        "DATABASE_URL is not PostgreSQL.",
        `Detected provider: ${classified.provider}.`,
        "This prevents VERCEL_ENV=production + file: SQLite from masquerading as Production.",
      ].join(" "),
    );
  }
}
