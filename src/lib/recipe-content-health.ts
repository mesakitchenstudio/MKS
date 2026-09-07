import {
  getRecipePublishingReadiness,
  type RecipePublishingCheck,
  type RecipePublishingReadiness,
  type RecipePublishingReadinessInput,
  type RecipePublishingStatus,
} from "@/lib/recipe-publishing-readiness";

/**
 * Content Health is derived Admin intelligence.
 * Publishing Readiness remains the sole rule engine — this layer maps status
 * for catalogue prioritization and never redefines required/recommended checks.
 */

export type RecipeContentHealthStatus =
  | "healthy"
  | "recommendations"
  | "needs_attention"
  | "draft_ready"
  | "draft_recommendations"
  | "draft_not_ready";

export type RecipeContentHealthIssueSeverity = "blocking" | "recommendation";

export type RecipeContentHealthIssue = {
  /** Stable id from Publishing Readiness (e.g. recipe.hero_image). */
  id: string;
  severity: RecipeContentHealthIssueSeverity;
  title: string;
  description: string;
  source: "readiness";
  fieldKey?: string;
};

export type RecipeContentHealth = {
  recipeId: string;
  title: string;
  slug: string;
  publicationStatus: string;
  typeId: string;
  typeName: string;
  updatedAt: string;
  health: RecipeContentHealthStatus;
  readinessStatus: RecipePublishingStatus;
  readiness: RecipePublishingReadiness;
  issues: RecipeContentHealthIssue[];
  blockingCount: number;
  recommendationCount: number;
};

export type RecipeContentHealthSummary = {
  publishedCount: number;
  needsAttentionCount: number;
  recommendationsCount: number;
  draftsReadyCount: number;
  draftsNotReadyCount: number;
  healthyCount: number;
  totalCount: number;
};

export type RecipeContentHealthFilter = {
  publication?: "all" | "published" | "draft";
  health?:
    | "all"
    | "needs_attention"
    | "recommendations"
    | "healthy"
    | "draft_ready"
    | "draft_not_ready";
  typeId?: string;
  query?: string;
};

function normalizePublication(status: string): "published" | "draft" {
  return String(status || "").trim().toLowerCase() === "published" ? "published" : "draft";
}

function severityFromCheck(check: RecipePublishingCheck): RecipeContentHealthIssueSeverity {
  return check.severity === "required" ? "blocking" : "recommendation";
}

/** Map failed readiness checks → Content Health issues (no soft-warning duplication). */
export function issuesFromReadiness(
  readiness: RecipePublishingReadiness,
): RecipeContentHealthIssue[] {
  const failed = [...readiness.required, ...readiness.recommended].filter((check) => !check.passed);
  const byId = new Map<string, RecipeContentHealthIssue>();
  for (const check of failed) {
    // Prefer required/blocking if the same id somehow appeared twice.
    const next: RecipeContentHealthIssue = {
      id: check.id,
      severity: severityFromCheck(check),
      title: check.label,
      description: check.message,
      source: "readiness",
      fieldKey: check.fieldKey,
    };
    const existing = byId.get(check.id);
    if (!existing || (existing.severity === "recommendation" && next.severity === "blocking")) {
      byId.set(check.id, next);
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "blocking" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function mapReadinessToContentHealthStatus(
  publicationStatus: string,
  readinessStatus: RecipePublishingStatus,
): RecipeContentHealthStatus {
  const published = normalizePublication(publicationStatus) === "published";
  if (published) {
    if (readinessStatus === "not_ready") return "needs_attention";
    if (readinessStatus === "ready_with_recommendations") return "recommendations";
    return "healthy";
  }
  if (readinessStatus === "not_ready") return "draft_not_ready";
  if (readinessStatus === "ready_with_recommendations") return "draft_recommendations";
  return "draft_ready";
}

export function contentHealthStatusLabel(health: RecipeContentHealthStatus): string {
  switch (health) {
    case "healthy":
      return "Ready";
    case "recommendations":
      return "Recommendations";
    case "needs_attention":
      return "Needs attention";
    case "draft_ready":
      return "Draft — ready";
    case "draft_recommendations":
      return "Draft — recommendations";
    case "draft_not_ready":
      return "Draft — not ready";
  }
}

/**
 * Pure Content Health evaluation for one Recipe.
 * Consumes canonical getRecipePublishingReadiness — does not redefine rules.
 */
export function getRecipeContentHealth(input: {
  recipeId: string;
  title: string;
  slug: string;
  publicationStatus: string;
  typeId: string;
  typeName: string;
  updatedAt: string | Date;
  readinessInput: RecipePublishingReadinessInput;
}): RecipeContentHealth {
  const readiness = getRecipePublishingReadiness(input.readinessInput);
  const issues = issuesFromReadiness(readiness);
  const health = mapReadinessToContentHealthStatus(input.publicationStatus, readiness.status);
  return {
    recipeId: input.recipeId,
    title: input.title,
    slug: input.slug,
    publicationStatus: input.publicationStatus,
    typeId: input.typeId,
    typeName: input.typeName,
    updatedAt:
      typeof input.updatedAt === "string"
        ? input.updatedAt
        : input.updatedAt.toISOString(),
    health,
    readinessStatus: readiness.status,
    readiness,
    issues,
    blockingCount: issues.filter((issue) => issue.severity === "blocking").length,
    recommendationCount: issues.filter((issue) => issue.severity === "recommendation").length,
  };
}

/** Priority for published Needs Attention first, then recommendations, then drafts. */
export function contentHealthSortRank(row: RecipeContentHealth): number {
  switch (row.health) {
    case "needs_attention":
      return 0;
    case "recommendations":
      return 1;
    case "draft_not_ready":
      return 2;
    case "draft_recommendations":
      return 3;
    case "draft_ready":
      return 4;
    case "healthy":
      return 5;
  }
}

export function sortRecipeContentHealth(rows: RecipeContentHealth[]): RecipeContentHealth[] {
  return [...rows].sort((a, b) => {
    const rank = contentHealthSortRank(a) - contentHealthSortRank(b);
    if (rank !== 0) return rank;
    return a.title.localeCompare(b.title) || a.recipeId.localeCompare(b.recipeId);
  });
}

export function summarizeRecipeContentHealth(rows: RecipeContentHealth[]): RecipeContentHealthSummary {
  let publishedCount = 0;
  let needsAttentionCount = 0;
  let recommendationsCount = 0;
  let draftsReadyCount = 0;
  let draftsNotReadyCount = 0;
  let healthyCount = 0;

  for (const row of rows) {
    if (normalizePublication(row.publicationStatus) === "published") {
      publishedCount += 1;
      if (row.health === "needs_attention") needsAttentionCount += 1;
      else if (row.health === "recommendations") recommendationsCount += 1;
      else healthyCount += 1;
    } else if (row.health === "draft_not_ready") {
      draftsNotReadyCount += 1;
    } else {
      // draft_ready + draft_recommendations = publishable drafts
      draftsReadyCount += 1;
    }
  }

  return {
    publishedCount,
    needsAttentionCount,
    recommendationsCount,
    draftsReadyCount,
    draftsNotReadyCount,
    healthyCount,
    totalCount: rows.length,
  };
}

export function filterRecipeContentHealth(
  rows: RecipeContentHealth[],
  filters: RecipeContentHealthFilter,
): RecipeContentHealth[] {
  const publication = filters.publication ?? "all";
  const health = filters.health ?? "all";
  const typeId = String(filters.typeId || "").trim();
  const query = String(filters.query || "")
    .trim()
    .toLowerCase();

  return rows.filter((row) => {
    if (publication === "published" && normalizePublication(row.publicationStatus) !== "published") {
      return false;
    }
    if (publication === "draft" && normalizePublication(row.publicationStatus) !== "draft") {
      return false;
    }
    if (typeId && row.typeId !== typeId) return false;
    if (query && !row.title.toLowerCase().includes(query) && !row.slug.toLowerCase().includes(query)) {
      return false;
    }
    if (health === "all") return true;
    if (health === "needs_attention") return row.health === "needs_attention";
    if (health === "recommendations") return row.health === "recommendations";
    if (health === "healthy") return row.health === "healthy";
    if (health === "draft_ready") {
      return row.health === "draft_ready" || row.health === "draft_recommendations";
    }
    if (health === "draft_not_ready") return row.health === "draft_not_ready";
    return true;
  });
}

/** Top failed issues for list UI (blocking first). */
export function topContentHealthIssues(row: RecipeContentHealth, limit = 3): RecipeContentHealthIssue[] {
  return row.issues.slice(0, Math.max(0, limit));
}
