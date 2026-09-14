import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AdminAuditActor } from "@/lib/admin-audit";
import { summarizeRecipeAuditChanges } from "@/lib/admin-audit";
import { getDb } from "@/lib/db";
import { rebuildRecipeIngredientIndex } from "@/lib/ingredient-index";
import { parseValues } from "@/lib/recipe-map";

export const RECIPE_REVISION_REASONS = [
  "created",
  "saved",
  "published",
  "moved_to_draft",
  "restored",
  "baseline",
] as const;

export type RecipeRevisionReason = (typeof RECIPE_REVISION_REASONS)[number];

export const RECIPE_REVISION_SNAPSHOT_VERSION = 1 as const;

/**
 * Canonical recoverable recipe document.
 * `slug` / `status` / `publishedAt` are historical context only —
 * restore applies content fields and leaves current URL/publication alone.
 */
export type RecipeRevisionSnapshot = {
  version: typeof RECIPE_REVISION_SNAPSHOT_VERSION;
  title: string;
  excerpt: string;
  featured: boolean;
  seasonal: boolean;
  typeId: string;
  categoryIds: string[];
  values: Record<string, unknown>;
  slug: string;
  status: string;
  publishedAt: string | null;
  /** Editorial public update note — recoverable with content. */
  publicUpdateNote: string | null;
  publicUpdatedAt: string | null;
};

export type RecipeRevisionActor = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
};

type DbClient = Prisma.TransactionClient | ReturnType<typeof getDb>;

function clip(value: unknown, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/** Deterministic JSON: sorted object keys, stable arrays for categoryIds. */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortForStableJson);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortForStableJson(obj[key]);
  }
  return sorted;
}

/**
 * Hash covers recoverable content only — excludes slug/status/publishedAt
 * so URL or publish-only transitions do not create duplicate content revisions.
 */
export function contentPayloadForHash(snapshot: RecipeRevisionSnapshot) {
  return {
    version: snapshot.version,
    title: snapshot.title,
    excerpt: snapshot.excerpt,
    featured: snapshot.featured,
    seasonal: snapshot.seasonal,
    typeId: snapshot.typeId,
    categoryIds: [...snapshot.categoryIds].sort(),
    values: snapshot.values,
    publicUpdateNote: snapshot.publicUpdateNote,
    publicUpdatedAt: snapshot.publicUpdatedAt,
  };
}

export function hashRecipeRevisionSnapshot(snapshot: RecipeRevisionSnapshot): string {
  return createHash("sha256")
    .update(stableSerialize(contentPayloadForHash(snapshot)))
    .digest("hex");
}

export function buildRecipeRevisionSnapshot(input: {
  title: string;
  excerpt: string;
  featured: boolean;
  seasonal: boolean;
  typeId: string;
  categoryIds: string[];
  values: Record<string, unknown> | string;
  slug: string;
  status: string;
  publishedAt?: Date | string | null;
  publicUpdateNote?: string | null;
  publicUpdatedAt?: Date | string | null;
}): RecipeRevisionSnapshot {
  const values =
    typeof input.values === "string" ? parseValues(input.values) : { ...input.values };
  let publishedAt: string | null = null;
  if (input.publishedAt instanceof Date) {
    publishedAt = Number.isNaN(input.publishedAt.getTime())
      ? null
      : input.publishedAt.toISOString();
  } else if (typeof input.publishedAt === "string" && input.publishedAt.trim()) {
    publishedAt = input.publishedAt.trim();
  }

  let publicUpdatedAt: string | null = null;
  if (input.publicUpdatedAt instanceof Date) {
    publicUpdatedAt = Number.isNaN(input.publicUpdatedAt.getTime())
      ? null
      : input.publicUpdatedAt.toISOString();
  } else if (typeof input.publicUpdatedAt === "string" && input.publicUpdatedAt.trim()) {
    publicUpdatedAt = input.publicUpdatedAt.trim();
  }

  const noteRaw = String(input.publicUpdateNote ?? "").trim();
  const publicUpdateNote = noteRaw && publicUpdatedAt ? noteRaw : null;
  if (!publicUpdateNote) publicUpdatedAt = null;

  return {
    version: RECIPE_REVISION_SNAPSHOT_VERSION,
    title: String(input.title || "").trim(),
    excerpt: String(input.excerpt || ""),
    featured: Boolean(input.featured),
    seasonal: Boolean(input.seasonal),
    typeId: String(input.typeId || ""),
    categoryIds: [...new Set(input.categoryIds.map(String).filter(Boolean))].sort(),
    values,
    slug: String(input.slug || "").trim(),
    status: String(input.status || "draft"),
    publishedAt,
    publicUpdateNote,
    publicUpdatedAt,
  };
}

export function parseRecipeRevisionSnapshot(raw: string): RecipeRevisionSnapshot | null {
  try {
    const parsed = JSON.parse(raw || "{}") as Partial<RecipeRevisionSnapshot>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.title || !parsed.typeId) return null;
    return buildRecipeRevisionSnapshot({
      title: String(parsed.title || ""),
      excerpt: String(parsed.excerpt || ""),
      featured: Boolean(parsed.featured),
      seasonal: Boolean(parsed.seasonal),
      typeId: String(parsed.typeId || ""),
      categoryIds: Array.isArray(parsed.categoryIds)
        ? parsed.categoryIds.map(String)
        : [],
      values:
        parsed.values && typeof parsed.values === "object" && !Array.isArray(parsed.values)
          ? (parsed.values as Record<string, unknown>)
          : {},
      slug: String(parsed.slug || ""),
      status: String(parsed.status || "draft"),
      publishedAt: parsed.publishedAt ?? null,
      publicUpdateNote: parsed.publicUpdateNote ?? null,
      publicUpdatedAt: parsed.publicUpdatedAt ?? null,
    });
  } catch {
    return null;
  }
}

export function resolveRecipeRevisionReason(input: {
  isCreate?: boolean;
  reason?: RecipeRevisionReason;
  oldStatus?: string | null;
  newStatus?: string;
}): RecipeRevisionReason {
  if (input.reason) return input.reason;
  if (input.isCreate) return "created";
  if (input.oldStatus && input.newStatus && input.oldStatus !== input.newStatus) {
    if (input.newStatus === "published") return "published";
    if (input.newStatus === "draft" && input.oldStatus === "published") {
      return "moved_to_draft";
    }
  }
  return "saved";
}

export function humanizeRecipeRevisionReason(reason: string): string {
  const map: Record<string, string> = {
    created: "Created recipe",
    saved: "Updated recipe",
    published: "Published recipe",
    moved_to_draft: "Moved recipe to draft",
    restored: "Restored recipe",
    baseline: "Initial baseline",
  };
  return map[reason] || reason;
}

function actorAdminId(actor?: RecipeRevisionActor | AdminAuditActor | null) {
  const id = actor?.id ? String(actor.id) : "";
  return id && id !== "env" ? id : null;
}

export type CreateRecipeRevisionInput = {
  recipeId: string;
  actor?: RecipeRevisionActor | AdminAuditActor | null;
  snapshot: RecipeRevisionSnapshot;
  reason?: RecipeRevisionReason;
  isCreate?: boolean;
  oldStatus?: string | null;
  newStatus?: string;
  previousSnapshot?: RecipeRevisionSnapshot | null;
  changedFields?: string[];
  restoredFromRevisionId?: string | null;
  note?: string;
  /** When true, always write even if hash matches latest (baseline uses false + skip if any). */
  force?: boolean;
};

export type CreateRecipeRevisionResult =
  | { created: true; id: string; contentHash: string; reason: RecipeRevisionReason }
  | { created: false; reason: "duplicate" | "invalid"; contentHash?: string };

/**
 * Create a revision when recoverable content changed vs the latest revision.
 * Intended to run inside the same Prisma transaction as the recipe write.
 */
export async function createRecipeRevisionIfChanged(
  db: DbClient,
  input: CreateRecipeRevisionInput,
): Promise<CreateRecipeRevisionResult> {
  const snapshot = buildRecipeRevisionSnapshot(input.snapshot);
  if (!snapshot.title || !snapshot.typeId) {
    return { created: false, reason: "invalid" };
  }

  const contentHash = hashRecipeRevisionSnapshot(snapshot);
  const latest = await db.recipeRevision.findFirst({
    where: { stableRecipeId: input.recipeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { contentHash: true },
  });

  if (!input.force && latest?.contentHash === contentHash) {
    return { created: false, reason: "duplicate", contentHash };
  }

  const reason = resolveRecipeRevisionReason({
    isCreate: input.isCreate,
    reason: input.reason,
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
  });

  let changedFields = input.changedFields;
  if (!changedFields) {
    if (input.isCreate || reason === "baseline") {
      changedFields = reason === "baseline" ? ["baseline"] : ["created"];
    } else if (input.previousSnapshot) {
      changedFields = summarizeRecipeAuditChanges({
        before: {
          title: input.previousSnapshot.title,
          slug: input.previousSnapshot.slug,
          excerpt: input.previousSnapshot.excerpt,
          status: input.previousSnapshot.status,
          featured: input.previousSnapshot.featured,
          seasonal: input.previousSnapshot.seasonal,
          typeId: input.previousSnapshot.typeId,
          categoryIds: input.previousSnapshot.categoryIds,
          values: input.previousSnapshot.values,
        },
        after: {
          title: snapshot.title,
          slug: snapshot.slug,
          excerpt: snapshot.excerpt,
          status: snapshot.status,
          featured: snapshot.featured,
          seasonal: snapshot.seasonal,
          typeId: snapshot.typeId,
          categoryIds: snapshot.categoryIds,
          values: snapshot.values,
        },
      }).filter((field) => field !== "slug" && field !== "status");
    } else {
      changedFields = [];
    }
  }

  const row = await db.recipeRevision.create({
    data: {
      recipeId: input.recipeId,
      stableRecipeId: input.recipeId,
      adminId: actorAdminId(input.actor),
      actorName: clip(
        input.actor?.name || (reason === "baseline" ? "System" : "Staff"),
        120,
      ),
      actorRole: clip(input.actor?.role || (reason === "baseline" ? "system" : ""), 40),
      reason,
      snapshot: stableSerialize(snapshot),
      contentHash,
      changedFields: JSON.stringify(changedFields),
      restoredFromRevisionId: input.restoredFromRevisionId || null,
      note: clip(input.note, 400),
    },
    select: { id: true },
  });

  return { created: true, id: row.id, contentHash, reason };
}

export type RecipeRevisionListItem = {
  id: string;
  createdAt: Date;
  actorName: string;
  actorRole: string;
  reason: string;
  changedFields: string[];
  note: string;
  restoredFromRevisionId: string | null;
  contentHash: string;
};

export async function listRecipeRevisions(
  recipeId: string,
  options?: { take?: number },
): Promise<RecipeRevisionListItem[]> {
  const take = Math.min(Math.max(options?.take ?? 100, 1), 300);
  const rows = await getDb().recipeRevision.findMany({
    where: { stableRecipeId: recipeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      createdAt: true,
      actorName: true,
      actorRole: true,
      reason: true,
      changedFields: true,
      note: true,
      restoredFromRevisionId: true,
      contentHash: true,
    },
  });

  return rows.map((row) => {
    let changedFields: string[] = [];
    try {
      const parsed = JSON.parse(row.changedFields || "[]") as unknown;
      if (Array.isArray(parsed)) changedFields = parsed.map(String);
    } catch {
      changedFields = [];
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      actorName: row.actorName,
      actorRole: row.actorRole,
      reason: row.reason,
      changedFields,
      note: row.note,
      restoredFromRevisionId: row.restoredFromRevisionId,
      contentHash: row.contentHash,
    };
  });
}

export async function getRecipeRevision(revisionId: string) {
  return getDb().recipeRevision.findUnique({ where: { id: revisionId } });
}

/**
 * Restore recoverable content from a revision.
 * Preserves current Recipe.id, slug, status, and publishedAt.
 * Series / studio links are not touched.
 */
export async function restoreRecipeRevisionContent(input: {
  recipeId: string;
  revisionId: string;
  actor?: RecipeRevisionActor | AdminAuditActor | null;
}): Promise<
  | {
      ok: true;
      revisionId: string;
      changedFields: string[];
      title: string;
    }
  | { ok: false; error: "missing_recipe" | "missing_revision" | "invalid_snapshot" | "mismatch" }
> {
  const db = getDb();
  const [recipe, revision] = await Promise.all([
    db.recipe.findUnique({
      where: { id: input.recipeId },
      include: { categories: { select: { categoryId: true } } },
    }),
    db.recipeRevision.findUnique({ where: { id: input.revisionId } }),
  ]);

  if (!recipe) return { ok: false, error: "missing_recipe" };
  if (!revision) return { ok: false, error: "missing_revision" };
  if (revision.stableRecipeId !== input.recipeId) {
    return { ok: false, error: "mismatch" };
  }

  const snapshot = parseRecipeRevisionSnapshot(revision.snapshot);
  if (!snapshot) return { ok: false, error: "invalid_snapshot" };

  // Ensure type still exists; if not, keep current typeId.
  const typeOk = await db.recipeType.findUnique({
    where: { id: snapshot.typeId },
    select: { id: true },
  });
  const typeId = typeOk ? snapshot.typeId : recipe.typeId;

  const validCategoryIds: string[] = [];
  if (snapshot.categoryIds.length) {
    const cats = await db.category.findMany({
      where: { id: { in: snapshot.categoryIds } },
      select: { id: true },
    });
    const found = new Set(cats.map((c) => c.id));
    for (const id of snapshot.categoryIds) {
      if (found.has(id)) validCategoryIds.push(id);
    }
  }

  const previousSnapshot = buildRecipeRevisionSnapshot({
    title: recipe.title,
    excerpt: recipe.excerpt,
    featured: recipe.featured,
    seasonal: recipe.seasonal,
    typeId: recipe.typeId,
    categoryIds: recipe.categories.map((c) => c.categoryId),
    values: recipe.values,
    slug: recipe.slug,
    status: recipe.status,
    publishedAt: recipe.publishedAt,
    publicUpdateNote: recipe.publicUpdateNote,
    publicUpdatedAt: recipe.publicUpdatedAt,
  });

  const nextSnapshot = buildRecipeRevisionSnapshot({
    title: snapshot.title,
    excerpt: snapshot.excerpt,
    featured: snapshot.featured,
    seasonal: snapshot.seasonal,
    typeId,
    categoryIds: validCategoryIds,
    values: snapshot.values,
    // Context fields remain current for the post-restore revision document.
    slug: recipe.slug,
    status: recipe.status,
    publishedAt: recipe.publishedAt,
    publicUpdateNote: snapshot.publicUpdateNote,
    publicUpdatedAt: snapshot.publicUpdatedAt,
  });

  const changedFields = summarizeRecipeAuditChanges({
    before: {
      title: previousSnapshot.title,
      slug: previousSnapshot.slug,
      excerpt: previousSnapshot.excerpt,
      status: previousSnapshot.status,
      featured: previousSnapshot.featured,
      seasonal: previousSnapshot.seasonal,
      typeId: previousSnapshot.typeId,
      categoryIds: previousSnapshot.categoryIds,
      values: previousSnapshot.values,
      publicUpdateNote: previousSnapshot.publicUpdateNote,
      publicUpdatedAt: previousSnapshot.publicUpdatedAt,
    },
    after: {
      title: nextSnapshot.title,
      slug: nextSnapshot.slug,
      excerpt: nextSnapshot.excerpt,
      status: nextSnapshot.status,
      featured: nextSnapshot.featured,
      seasonal: nextSnapshot.seasonal,
      typeId: nextSnapshot.typeId,
      categoryIds: nextSnapshot.categoryIds,
      values: nextSnapshot.values,
      publicUpdateNote: nextSnapshot.publicUpdateNote,
      publicUpdatedAt: nextSnapshot.publicUpdatedAt,
    },
  }).filter((field) => field !== "slug" && field !== "status");

  const created = await db.$transaction(async (tx) => {
    await tx.recipe.update({
      where: { id: input.recipeId },
      data: {
        title: nextSnapshot.title,
        excerpt: nextSnapshot.excerpt,
        featured: nextSnapshot.featured,
        seasonal: nextSnapshot.seasonal,
        typeId: nextSnapshot.typeId,
        values: JSON.stringify(nextSnapshot.values),
        publicUpdateNote: nextSnapshot.publicUpdateNote,
        publicUpdatedAt: nextSnapshot.publicUpdatedAt
          ? new Date(nextSnapshot.publicUpdatedAt)
          : null,
        // Explicitly do NOT change slug, status, publishedAt.
      },
    });
    await tx.recipeCategory.deleteMany({ where: { recipeId: input.recipeId } });
    if (validCategoryIds.length) {
      await tx.recipeCategory.createMany({
        data: validCategoryIds.map((categoryId) => ({
          recipeId: input.recipeId,
          categoryId,
        })),
      });
    }

    await rebuildRecipeIngredientIndex(tx, {
      recipeId: input.recipeId,
      values: nextSnapshot.values,
    });

    return createRecipeRevisionIfChanged(tx, {
      recipeId: input.recipeId,
      actor: input.actor,
      snapshot: nextSnapshot,
      reason: "restored",
      previousSnapshot,
      changedFields,
      restoredFromRevisionId: input.revisionId,
    });
  });

  if (!created.created) {
    // Content already matched — still OK as a no-op restore.
    return {
      ok: true,
      revisionId: input.revisionId,
      changedFields: [],
      title: nextSnapshot.title,
    };
  }

  return {
    ok: true,
    revisionId: created.id,
    changedFields,
    title: nextSnapshot.title,
  };
}

export type RecipeRevisionBaselineReport = {
  status: "SUCCESS" | "FAILED";
  examined: number;
  created: number;
  alreadyVersioned: number;
  failures: number;
};

export function formatRecipeRevisionBaselineReport(report: RecipeRevisionBaselineReport) {
  const lines = [
    "Recipe Revision Baseline",
    "",
    `Recipes examined:     ${String(report.examined).padStart(6)}`,
    `Baselines created:    ${String(report.created).padStart(6)}`,
    `Already versioned:    ${String(report.alreadyVersioned).padStart(6)}`,
    `Failures:             ${String(report.failures).padStart(6)}`,
    "",
    report.status,
  ];
  return lines.join("\n");
}

/**
 * Idempotent: recipes that already have any revision are skipped.
 */
export async function backfillRecipeRevisionBaselines(): Promise<RecipeRevisionBaselineReport> {
  const db = getDb();
  const recipes = await db.recipe.findMany({
    include: { categories: { select: { categoryId: true } } },
    orderBy: { id: "asc" },
  });

  let created = 0;
  let alreadyVersioned = 0;
  let failures = 0;

  for (const recipe of recipes) {
    try {
      const existingCount = await db.recipeRevision.count({
        where: { stableRecipeId: recipe.id },
      });
      if (existingCount > 0) {
        alreadyVersioned += 1;
        continue;
      }

      const snapshot = buildRecipeRevisionSnapshot({
        title: recipe.title,
        excerpt: recipe.excerpt,
        featured: recipe.featured,
        seasonal: recipe.seasonal,
        typeId: recipe.typeId,
        categoryIds: recipe.categories.map((c) => c.categoryId),
        values: recipe.values,
        slug: recipe.slug,
        status: recipe.status,
        publishedAt: recipe.publishedAt,
        publicUpdateNote: recipe.publicUpdateNote,
        publicUpdatedAt: recipe.publicUpdatedAt,
      });

      const result = await createRecipeRevisionIfChanged(db, {
        recipeId: recipe.id,
        actor: { id: null, name: "System", role: "system" },
        snapshot,
        reason: "baseline",
        note: "Initial revision baseline from existing recipe state.",
        changedFields: ["baseline"],
        force: true,
      });

      if (result.created) created += 1;
      else failures += 1;
    } catch (error) {
      console.error("[recipe-revisions] baseline failed", recipe.id, error);
      failures += 1;
    }
  }

  return {
    status: failures > 0 ? "FAILED" : "SUCCESS",
    examined: recipes.length,
    created,
    alreadyVersioned,
    failures,
  };
}
