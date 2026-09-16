import type { AdminArea } from "@/lib/admin-access";
import { getDb } from "@/lib/db";
import { RECIPE_PUBLICATION_LEGACY_MARKER_ACTION } from "@/lib/recipe-first-publication";
import { parseValues } from "@/lib/recipe-map";

export type AdminAuditActorType = "admin" | "system";

export type AdminAuditActor = {
  /** Admin.id, or "env" for System Owner, or null for system. */
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  actorType?: AdminAuditActorType;
};

export type RecordAdminAuditEventInput = {
  actor?: AdminAuditActor | null;
  action: string;
  area: AdminArea | string;
  entityType?: string;
  entityId?: string | null;
  entityLabel?: string | null;
  entityPath?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AdminAuditEventRow = {
  id: string;
  createdAt: Date;
  adminId: string | null;
  actorType: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  area: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  entityPath: string;
  metadata: Record<string, unknown>;
};

const SENSITIVE_META_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "refreshToken",
  "accessToken",
  "authorization",
  "cookie",
  "session",
  "secret",
]);

function clip(value: unknown, max = 240) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function sanitizeMetadata(input: Record<string, unknown> | null | undefined) {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_META_KEYS.has(key) || [...SENSITIVE_META_KEYS].some((s) => lower.includes(s))) {
      continue;
    }
    if (value == null) continue;
    if (typeof value === "string") {
      out[key] = clip(value, 500);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 40).map((item) =>
        typeof item === "string" ? clip(item, 120) : item,
      );
      continue;
    }
    // Nested objects only as shallow stringified summaries — never dump recipe.values.
    if (typeof value === "object") {
      out[key] = clip(JSON.stringify(value), 400);
    }
  }
  return out;
}

export function actorFromAdminSession(
  session: { id: string; name: string; email: string; role: string } | null | undefined,
): AdminAuditActor | null {
  if (!session) return null;
  return {
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    actorType: "admin",
  };
}

/**
 * Persist one successful Admin audit event.
 * Best-effort: logs and returns null on failure (does not throw).
 * Prefer calling only after the business mutation succeeds.
 *
 * Transaction notes (Phase 1C):
 * - Same-DB mutations usually record immediately after the write (not always in
 *   one Prisma $transaction yet — balanced failure policy).
 * - External / multi-step ops (YouTube sync, Analytics OAuth, playlist import)
 *   record only after confirmed success; they cannot be fully atomic with audit.
 */
export async function recordAdminAuditEvent(
  input: RecordAdminAuditEventInput,
): Promise<{ id: string } | null> {
  try {
    const actor = input.actor;
    const actorType = actor?.actorType || "admin";
    const rawAdminId = actor?.id ? String(actor.id) : "";
    // System Owner uses session id "env" — no Admin row FK.
    const adminId = rawAdminId && rawAdminId !== "env" ? rawAdminId : null;

    const row = await getDb().adminAuditEvent.create({
      data: {
        adminId,
        actorType,
        actorName: clip(actor?.name || (actorType === "system" ? "System" : "Staff"), 120),
        actorEmail: clip(actor?.email, 254),
        actorRole: clip(actor?.role, 40),
        action: clip(input.action, 80),
        area: clip(input.area || "content", 40),
        entityType: clip(input.entityType, 60),
        entityId: clip(input.entityId, 80),
        entityLabel: clip(input.entityLabel, 200),
        entityPath: clip(input.entityPath, 300),
        metadata: JSON.stringify(sanitizeMetadata(input.metadata ?? {})),
      },
      select: { id: true },
    });
    return row;
  } catch (error) {
    console.error("[admin-audit] failed to record event", input.action, error);
    return null;
  }
}

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

function sectionChanged(before: unknown, after: unknown) {
  return stableJson(before) !== stableJson(after);
}

/**
 * Lightweight recipe change summary for audit metadata (not revision diffs).
 * Returns coarse section names suitable for `changedFields`.
 */
export function summarizeRecipeAuditChanges(input: {
  before: {
    title: string;
    slug: string;
    excerpt: string;
    status: string;
    featured: boolean;
    seasonal: boolean;
    typeId: string;
    categoryIds: string[];
    values: Record<string, unknown> | string;
    publicUpdateNote?: string | null;
    publicUpdatedAt?: string | Date | null;
  } | null;
  after: {
    title: string;
    slug: string;
    excerpt: string;
    status: string;
    featured: boolean;
    seasonal: boolean;
    typeId: string;
    categoryIds: string[];
    values: Record<string, unknown> | string;
    publicUpdateNote?: string | null;
    publicUpdatedAt?: string | Date | null;
  };
}): string[] {
  if (!input.before) return ["created"];

  const beforeValues =
    typeof input.before.values === "string"
      ? parseValues(input.before.values)
      : input.before.values;
  const afterValues =
    typeof input.after.values === "string"
      ? parseValues(input.after.values)
      : input.after.values;

  const changed: string[] = [];
  if (input.before.title !== input.after.title) changed.push("title");
  if (input.before.slug !== input.after.slug) changed.push("slug");
  if (input.before.excerpt !== input.after.excerpt) changed.push("excerpt");
  if (input.before.status !== input.after.status) changed.push("status");
  if (input.before.featured !== input.after.featured) changed.push("featured");
  if (input.before.seasonal !== input.after.seasonal) changed.push("seasonal");
  if (input.before.typeId !== input.after.typeId) changed.push("recipeType");

  const beforeCats = [...input.before.categoryIds].sort().join(",");
  const afterCats = [...input.after.categoryIds].sort().join(",");
  if (beforeCats !== afterCats) changed.push("categories");

  if (sectionChanged(beforeValues.image, afterValues.image) || sectionChanged(beforeValues.imageAlt, afterValues.imageAlt)) {
    changed.push("heroImage");
  }
  if (sectionChanged(beforeValues.ingredients, afterValues.ingredients)) changed.push("ingredients");
  if (sectionChanged(beforeValues.instructions, afterValues.instructions)) changed.push("instructions");
  if (
    sectionChanged(beforeValues.prepMinutes, afterValues.prepMinutes) ||
    sectionChanged(beforeValues.bakeMinutes, afterValues.bakeMinutes) ||
    sectionChanged(beforeValues.cookMinutes, afterValues.cookMinutes) ||
    sectionChanged(beforeValues.restMinutes, afterValues.restMinutes) ||
    sectionChanged(beforeValues.servings, afterValues.servings) ||
    sectionChanged(beforeValues.servingsUnit, afterValues.servingsUnit)
  ) {
    changed.push("timesYield");
  }
  if (
    sectionChanged(beforeValues.intro, afterValues.intro) ||
    sectionChanged(beforeValues.whyItWorks, afterValues.whyItWorks) ||
    sectionChanged(beforeValues.tips, afterValues.tips) ||
    sectionChanged(beforeValues.faqs, afterValues.faqs) ||
    sectionChanged(beforeValues.keyIngredients, afterValues.keyIngredients) ||
    sectionChanged(beforeValues.notes, afterValues.notes)
  ) {
    changed.push("learn");
  }
  if (
    sectionChanged(beforeValues.youtubeUrl, afterValues.youtubeUrl) ||
    sectionChanged(beforeValues.youtube, afterValues.youtube) ||
    sectionChanged(beforeValues.floatingYoutubeUrl, afterValues.floatingYoutubeUrl)
  ) {
    changed.push("youtube");
  }
  if (sectionChanged(beforeValues.nutrition, afterValues.nutrition)) changed.push("nutrition");

  const beforeNote = String(input.before.publicUpdateNote ?? "").trim();
  const afterNote = String(input.after.publicUpdateNote ?? "").trim();
  const beforePub = toIsoOrEmpty(input.before.publicUpdatedAt);
  const afterPub = toIsoOrEmpty(input.after.publicUpdatedAt);
  if (beforeNote !== afterNote || beforePub !== afterPub) {
    changed.push("publicUpdateNote");
  }

  return changed;
}

function toIsoOrEmpty(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  return String(value).trim();
}

/**
 * Record the most meaningful audit event(s) for a recipe save.
 * Prefer semantic status/slug events over a generic update when those apply.
 */
export async function recordRecipeSaveAudit(input: {
  actor: AdminAuditActor | null | undefined;
  isCreate: boolean;
  recipeId: string;
  title: string;
  slug: string;
  previousSlug: string | null;
  oldStatus: string | null;
  newStatus: string;
  changedFields: string[];
  redirectCreated?: boolean;
}) {
  const base = {
    actor: input.actor,
    area: "content" as const,
    entityType: "recipe",
    entityId: input.recipeId,
    entityLabel: input.title,
    entityPath: `/admin/recipes/${input.recipeId}`,
  };

  if (input.isCreate) {
    await recordAdminAuditEvent({
      ...base,
      action: "recipe.created",
      metadata: { status: input.newStatus, slug: input.slug },
    });
    return;
  }

  const slugChanged =
    Boolean(input.previousSlug) && input.previousSlug !== input.slug;
  const statusChanged =
    Boolean(input.oldStatus) && input.oldStatus !== input.newStatus;

  if (slugChanged) {
    await recordAdminAuditEvent({
      ...base,
      action: "recipe.slug_changed",
      metadata: {
        oldSlug: input.previousSlug,
        newSlug: input.slug,
        redirectCreated: Boolean(input.redirectCreated),
        ...(statusChanged
          ? { oldStatus: input.oldStatus, newStatus: input.newStatus }
          : {}),
      },
    });
    // Slug change already records the important operational moment; skip a second
    // generic update. Status change is included in metadata when present.
    return;
  }

  if (statusChanged && input.newStatus === "published") {
    await recordAdminAuditEvent({
      ...base,
      action: "recipe.published",
      metadata: {
        oldStatus: input.oldStatus,
        newStatus: input.newStatus,
        changedFields: input.changedFields.filter((f) => f !== "status"),
      },
    });
    return;
  }

  if (statusChanged && input.newStatus === "draft" && input.oldStatus === "published") {
    await recordAdminAuditEvent({
      ...base,
      action: "recipe.moved_to_draft",
      metadata: {
        oldStatus: input.oldStatus,
        newStatus: input.newStatus,
        changedFields: input.changedFields.filter((f) => f !== "status"),
      },
    });
    return;
  }

  const fields = input.changedFields.filter(Boolean);
  if (!fields.length) return;

  await recordAdminAuditEvent({
    ...base,
    action: "recipe.updated",
    metadata: { changedFields: fields },
  });
}

export function humanizeAdminAuditAction(action: string): string {
  const map: Record<string, string> = {
    "recipe.created": "Created recipe",
    "recipe.updated": "Updated recipe",
    "recipe.published": "Published recipe",
    [RECIPE_PUBLICATION_LEGACY_MARKER_ACTION]:
      "Recorded legacy publication (pre-notification tracking)",
    "recipe.moved_to_draft": "Moved recipe to draft",
    "recipe.deleted": "Deleted recipe",
    "recipe.slug_changed": "Changed recipe slug",
    "recipe.restored": "Restored recipe",
    "redirect.activated": "Activated redirect",
    "redirect.deactivated": "Deactivated redirect",
    "category.created": "Created category",
    "category.updated": "Updated category",
    "category.deleted": "Deleted category",
    "ingredient.created": "Created ingredient",
    "ingredient.alias_added": "Added ingredient alias",
    "ingredient.alias_removed": "Removed ingredient alias",
    "ingredient.unresolved_resolved": "Resolved unresolved ingredient",
    "type.created": "Created recipe type",
    "type.updated": "Updated recipe type",
    "type.deleted": "Deleted recipe type",
    "series.created": "Created series",
    "series.updated": "Updated series",
    "series.published": "Published series",
    "series.unpublished": "Unpublished series",
    "series.deleted": "Deleted series",
    "review.deleted": "Deleted review",
    "review.replied": "Replied to review",
    "member.deleted": "Deleted member",
    "staff.created": "Created staff account",
    "staff.updated": "Updated staff account",
    "staff.role_changed": "Changed staff role",
    "staff.deleted": "Deleted staff account",
    "youtube.sync_triggered": "Triggered YouTube sync",
    "youtube.release_updated": "Updated YouTube release",
    "youtube.settings_updated": "Updated YouTube settings",
    "site_setting.updated": "Updated site setting",
    "studio.links_updated": "Updated studio lesson links",
    "media.created": "Created media asset",
    "media.registered": "Registered media asset",
    "media.updated": "Updated media asset",
    "media.activated": "Activated media asset",
    "media.deactivated": "Deactivated media asset",
    "media.deleted": "Deleted media asset",
    "recipe.scheduled": "Scheduled recipe publish",
    "recipe.schedule_cancelled": "Cancelled recipe schedule",
    "recipe.scheduled_publish_blocked": "Blocked scheduled recipe publish",
    "search_console.connected": "Connected Search Console",
    "search_console.property_selected": "Selected Search Console property",
    "search_console.disconnected": "Disconnected Search Console",
    "search_console.sync_requested": "Requested Search Console sync",
  };
  return map[action] || action.replace(/\./g, " ");
}

export async function listAdminAuditEvents(options?: {
  take?: number;
  area?: string;
  action?: string;
  actorEmail?: string;
  q?: string;
}): Promise<AdminAuditEventRow[]> {
  const take = Math.min(Math.max(options?.take ?? 100, 1), 300);
  const where: Record<string, unknown> = {};
  if (options?.area) where.area = options.area;
  if (options?.action) where.action = options.action;
  if (options?.actorEmail) where.actorEmail = options.actorEmail.trim().toLowerCase();
  const q = options?.q?.trim();
  if (q) {
    where.OR = [
      { entityLabel: { contains: q } },
      { action: { contains: q } },
      { actorName: { contains: q } },
      { actorEmail: { contains: q } },
      { entityId: { contains: q } },
    ];
  }

  const rows = await getDb().adminAuditEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });

  return rows.map((row) => {
    let metadata: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.metadata || "{}") as unknown;
      if (parsed && typeof parsed === "object") metadata = parsed as Record<string, unknown>;
    } catch {
      metadata = {};
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      adminId: row.adminId,
      actorType: row.actorType,
      actorName: row.actorName,
      actorEmail: row.actorEmail,
      actorRole: row.actorRole,
      action: row.action,
      area: row.area,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      entityPath: row.entityPath,
      metadata,
    };
  });
}
