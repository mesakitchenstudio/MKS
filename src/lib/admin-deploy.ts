/** Server-readable deploy identity for signed-in admin UI. */

export type AdminDeployInfo = {
  shortSha: string;
  fullSha: string | null;
  envLabel: "Production" | "Preview" | "Development" | "Local";
};

function envLabelFromVercel(value: string | undefined): AdminDeployInfo["envLabel"] {
  switch (value) {
    case "production":
      return "Production";
    case "preview":
      return "Preview";
    case "development":
      return "Development";
    default:
      return "Local";
  }
}

/** Prefer Vercel system vars; fall back to a clear local label. */
export function getAdminDeployInfo(
  env: NodeJS.ProcessEnv = process.env,
): AdminDeployInfo {
  const fullSha = env.VERCEL_GIT_COMMIT_SHA?.trim() || null;
  const shortSha = fullSha ? fullSha.slice(0, 7) : "local";
  return {
    shortSha,
    fullSha,
    envLabel: fullSha ? envLabelFromVercel(env.VERCEL_ENV) : "Local",
  };
}

export function formatAdminDeployLine(info: AdminDeployInfo) {
  return `${info.shortSha} · ${info.envLabel}`;
}
