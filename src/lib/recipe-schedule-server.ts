import { recordAdminAuditEvent, recordRecipeSaveAudit } from "@/lib/admin-audit";
import { createAdminNotification } from "@/lib/admin-notifications-server";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { getRecipePublishingReadiness } from "@/lib/recipe-publishing-readiness";
import {
  buildRecipeRevisionSnapshot,
  createRecipeRevisionIfChanged,
} from "@/lib/recipe-revisions";
import {
  decideScheduledRecipePublish,
  scheduleFailureClearsSchedule,
  scheduledPublishClaimWhere,
} from "@/lib/recipe-schedule";

type TypeFieldRow = {
  typeId: string;
  key: string;
  label: string;
  kind: string;
  required: boolean;
  helpText: string;
  options: string;
  sortOrder: number;
};

function toSchemaFields(fields: TypeFieldRow[]): SchemaField[] {
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: field.required,
    helpText: field.helpText,
    options: (() => {
      try {
        const parsed = JSON.parse(field.options || "[]") as unknown;
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })(),
  }));
}

export type ScheduledRecipePublishRunResult = {
  ok: boolean;
  scanned: number;
  published: number;
  failedDeterministic: number;
  failedTransient: number;
  skipped: number;
  truncated: boolean;
  errors: string[];
};

const BATCH_LIMIT = 25;

/**
 * Atomically claim a due scheduled draft for publication.
 * Returns false when another cron/human publish already won the race.
 */
export async function claimScheduledRecipePublish(input: {
  recipeId: string;
  publishedAt: Date;
  now: Date;
}): Promise<{ claimed: boolean }> {
  const db = getDb();
  const result = await db.recipe.updateMany({
    where: scheduledPublishClaimWhere({ recipeId: input.recipeId, now: input.now }),
    data: {
      status: "published",
      publishedAt: input.publishedAt,
      scheduledPublishAt: null,
    },
  });
  return { claimed: result.count === 1 };
}

/**
 * Publish due scheduled drafts. Uses canonical Publishing Readiness.
 * Does not touch YouTube Release Planner.
 */
export async function runScheduledRecipePublishLifecycle(
  now: Date = new Date(),
): Promise<ScheduledRecipePublishRunResult> {
  const db = getDb();
  const errors: string[] = [];
  let published = 0;
  let failedDeterministic = 0;
  let failedTransient = 0;
  let skipped = 0;

  const due = await db.recipe.findMany({
    where: {
      status: "draft",
      scheduledPublishAt: { lte: now, not: null },
    },
    orderBy: [{ scheduledPublishAt: "asc" }, { id: "asc" }],
    take: BATCH_LIMIT + 1,
    include: {
      categories: { select: { categoryId: true } },
      type: { select: { id: true, name: true } },
    },
  });

  const truncated = due.length > BATCH_LIMIT;
  const batch = due.slice(0, BATCH_LIMIT);
  const typeIds = [...new Set(batch.map((recipe) => recipe.typeId))];
  const typeFields =
    typeIds.length === 0
      ? []
      : await db.recipeTypeField.findMany({
          where: { typeId: { in: typeIds } },
          orderBy: { sortOrder: "asc" },
        });
  const fieldsByType = new Map<string, TypeFieldRow[]>();
  for (const field of typeFields) {
    const list = fieldsByType.get(field.typeId) ?? [];
    list.push(field);
    fieldsByType.set(field.typeId, list);
  }

  for (const recipe of batch) {
    try {
      const fields = fieldsByType.get(recipe.typeId) ?? [];
      const schemaFields = toSchemaFields(fields);
      const values = parseValues(recipe.values);
      const categoryIds = recipe.categories.map((row) => row.categoryId);
      const readiness = getRecipePublishingReadiness({
        title: recipe.title,
        slug: recipe.slug,
        excerpt: recipe.excerpt,
        typeId: recipe.typeId,
        fields: fields.map((field) => ({
          key: field.key,
          label: field.label,
          kind: field.kind,
          required: field.required,
        })),
        values,
        categoryIds,
        typeFields: schemaFields,
      });

      const decision = decideScheduledRecipePublish({
        status: recipe.status,
        scheduledPublishAt: recipe.scheduledPublishAt,
        readinessStatus: readiness.status,
        now,
      });

      if (decision.action === "skip") {
        skipped += 1;
        continue;
      }

      if (decision.action === "fail") {
        // Deterministic readiness failure — clear schedule; retry would fail identically.
        if (scheduleFailureClearsSchedule("deterministic")) {
          await db.recipe.update({
            where: { id: recipe.id },
            data: { scheduledPublishAt: null },
          });
        }
        await recordAdminAuditEvent({
          actor: { actorType: "system", name: "System", role: "system" },
          action: "recipe.scheduled_publish_blocked",
          area: "content",
          entityType: "recipe",
          entityId: recipe.id,
          entityLabel: recipe.title,
          entityPath: `/admin/recipes/${recipe.id}`,
          metadata: { readinessStatus: readiness.status },
        });
        await createAdminNotification({
          type: "recipe.schedule.blocked",
          severity: "attention",
          title: `Scheduled publish blocked for “${recipe.title}”`,
          body:
            decision.reason ||
            "Publishing readiness blocked scheduled publish. Fix the recipe and schedule again.",
          entityType: "recipe",
          entityId: recipe.id,
          entityLabel: recipe.title,
          entityPath: `/admin/recipes/${recipe.id}`,
          metadata: { readinessStatus: readiness.status },
          dedupeByTypeEntity: true,
        });
        failedDeterministic += 1;
        continue;
      }

      const publishedAt = recipe.publishedAt ?? now;
      const previousSnapshot = buildRecipeRevisionSnapshot({
        title: recipe.title,
        excerpt: recipe.excerpt,
        featured: recipe.featured,
        seasonal: recipe.seasonal,
        typeId: recipe.typeId,
        categoryIds,
        values: recipe.values,
        slug: recipe.slug,
        status: recipe.status,
        publishedAt: recipe.publishedAt,
        publicUpdateNote: recipe.publicUpdateNote,
        publicUpdatedAt: recipe.publicUpdatedAt,
      });
      const nextSnapshot = buildRecipeRevisionSnapshot({
        title: recipe.title,
        excerpt: recipe.excerpt,
        featured: recipe.featured,
        seasonal: recipe.seasonal,
        typeId: recipe.typeId,
        categoryIds,
        values: recipe.values,
        slug: recipe.slug,
        status: "published",
        publishedAt,
        publicUpdateNote: recipe.publicUpdateNote,
        publicUpdatedAt: recipe.publicUpdatedAt,
      });

      const claim = await claimScheduledRecipePublish({
        recipeId: recipe.id,
        publishedAt,
        now,
      });
      if (!claim.claimed) {
        // Lost race to another cron or human Publish — no duplicate side effects.
        skipped += 1;
        continue;
      }

      // Publication-only transition: content hash excludes status/publishedAt, so
      // createRecipeRevisionIfChanged should no-op when content is unchanged.
      await createRecipeRevisionIfChanged(db, {
        recipeId: recipe.id,
        actor: { name: "System", role: "system" },
        snapshot: nextSnapshot,
        previousSnapshot,
        isCreate: false,
        oldStatus: "draft",
        newStatus: "published",
        reason: "published",
      });

      await recordRecipeSaveAudit({
        actor: { actorType: "system", name: "System", role: "system" },
        isCreate: false,
        recipeId: recipe.id,
        title: recipe.title,
        slug: recipe.slug,
        previousSlug: recipe.slug,
        oldStatus: "draft",
        newStatus: "published",
        changedFields: ["status", "publishedAt", "scheduledPublishAt"],
      });

      await createAdminNotification({
        type: "recipe.schedule.succeeded",
        severity: "success",
        title: `Published “${recipe.title}”`,
        body: "Scheduled publish completed.",
        entityType: "recipe",
        entityId: recipe.id,
        entityLabel: recipe.title,
        entityPath: `/admin/recipes/${recipe.id}`,
        dedupeByTypeEntity: true,
      });

      published += 1;
    } catch (error) {
      failedTransient += 1;
      const message = error instanceof Error ? error.message : "Unknown schedule publish error";
      errors.push(`${recipe.id}: ${message}`);
      console.error("Scheduled recipe publish transient failure", recipe.id, error);
      try {
        // Transient failures must NOT clear schedule (scheduleFailureClearsSchedule("transient") === false).
        const still = await db.recipe.findUnique({
          where: { id: recipe.id },
          select: { status: true, scheduledPublishAt: true, title: true },
        });
        if (
          still &&
          still.status === "draft" &&
          still.scheduledPublishAt &&
          !scheduleFailureClearsSchedule("transient")
        ) {
          await createAdminNotification({
            type: "recipe.schedule.retrying",
            severity: "attention",
            title: `Scheduled publish delayed for “${still.title}”`,
            body: "A temporary system error blocked publish. Mesa will retry automatically.",
            entityType: "recipe",
            entityId: recipe.id,
            entityLabel: still.title,
            entityPath: `/admin/recipes/${recipe.id}`,
            dedupeByTypeEntity: true,
          });
        }
      } catch (notifyError) {
        console.error("Could not notify schedule transient failure", notifyError);
      }
    }
  }

  return {
    ok: errors.length === 0,
    scanned: batch.length,
    published,
    failedDeterministic,
    failedTransient,
    skipped,
    truncated,
    errors,
  };
}
