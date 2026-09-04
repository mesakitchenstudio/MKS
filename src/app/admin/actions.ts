"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { homeForRole, isAccessLevel, canManageYoutubeSync, canManageYoutubeAnalytics, canDeleteGuestVisitors, canDeleteMembers } from "@/lib/admin-access";

import { clearAdminLoginFailures, isAdminLoginBlocked, recordAdminLoginFailure } from "@/lib/admin-login-guard";
import { authenticateAdmin, clearAllAuthCookies, getAdminSession, requireAccess, writeAdminSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CORE_FIELDS, emptyValue, keyFromLabel, slugify } from "@/lib/fields";
import { coerceStringList, isPlainStringListKind } from "@/lib/coerce-string-list";
import {
  countRecipesMissingFieldContent,
  countRecipesWithFieldContent,
  coreFieldDefinition,
  isCoreFieldKey,
} from "@/lib/field-admin";
import {
  isAcceptableAdminPassword,
  isReservedSystemOwnerEmail,
  isValidAdminEmail,
  normalizeAdminEmail,
  shouldUpdateAdminPassword,
  validateAdminDeletion,
  validateAdminRoleChange,
} from "@/lib/admin-staff";
import { hashPassword } from "@/lib/passwords";
import {
  MEMBER_BULK_DELETE_MAX,
  normalizeMemberIds,
  removeMemberByEmail,
} from "@/lib/accounts";
import { enrichRecipeValuesYoutubeFromDescription } from "@/lib/youtube-description";
import {
  enrichRecipeValuesWithDerivedChapters,
  normalizeInstructionGroups,
  validateInstructionChapters,
} from "@/lib/instruction-chapters";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { parseTimestampInput } from "@/lib/youtube-metadata-editor";
import { deleteGuestVisitorsForAdmin } from "@/lib/guest-analytics";
import { normalizeGuestVisitorIds } from "@/lib/guest-tracking";
import { connectionMeta } from "@/lib/request-meta";
import { syncYoutubeChannel } from "@/lib/youtube-data/sync";
import {
  clearRecipeYoutubeLinkInDb,
} from "@/lib/youtube-data/video-selector";
import { createAndPopulateRecipeFromYoutubeVideo } from "@/lib/youtube-data/create-recipe-from-video";
import { applyServerStaffVerification } from "@/lib/recipe-staff-verify";
import type { RecipeTypeConfidence } from "@/lib/ai-recipe/classify-recipe-type";

async function requireEditor() {
  await requireAccess("content");
}

function isNextRedirect(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT"),
  );
}

export async function loginAction(formData: FormData) {
  const ip = connectionMeta(await headers()).ip;
  if (isAdminLoginBlocked(ip)) {
    redirect("/admin/login?error=locked");
  }
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const admin = await authenticateAdmin(email, password);
  if (!admin) {
    recordAdminLoginFailure(ip);
    redirect("/admin/login?error=1");
  }
  clearAdminLoginFailures(ip);
  await writeAdminSession(admin);
  redirect(homeForRole(admin.role));
}

export async function logoutAction() {
  const jar = await cookies();
  const present = jar.getAll().map((cookie) => cookie.name);
  clearAllAuthCookies(jar, present);
  // Best-effort Auth.js cleanup; cookie expiry above is the durable guarantee.
  try {
    await signOut({ redirect: false });
  } catch {
    // Ignore — redirect below always completes logout UX.
  }
  redirect("/admin/login");
}

export async function saveCategoryAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const group = String(formData.get("group") || "course");
  const returnParams = new URLSearchParams({
    name,
    slug: String(formData.get("slug") || "").trim(),
    description,
    group,
    add: "1",
  });

  if (!name) {
    redirect(`/admin/categories?error=missing-name&${returnParams.toString()}`);
  }

  const validGroups = ["desserts", "course", "method", "holiday"];
  if (!validGroups.includes(group)) {
    redirect(`/admin/categories?error=invalid-group&${returnParams.toString()}`);
  }

  if (id) {
    const existing = await db.category.findUnique({ where: { id } });
    if (!existing) redirect("/admin/categories");
    try {
      await db.category.update({
        where: { id },
        data: { name, slug: existing.slug, description, group },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        redirect(`/admin/categories?error=duplicate&categoryId=${id}`);
      }
      throw error;
    }
    revalidatePath("/admin/categories");
    revalidatePath("/");
    revalidatePath(`/category/${existing.slug}`);
    redirect(`/admin/categories?saved=category&categoryId=${id}#category-${id}`);
  }

  const slug = slugify(String(formData.get("slug") || name));
  if (!slug) {
    redirect(`/admin/categories?error=invalid-slug&${returnParams.toString()}`);
  }

  try {
    const created = await db.category.create({ data: { name, slug, description, group } });
    revalidatePath("/admin/categories");
    revalidatePath("/");
    redirect(`/admin/categories?saved=category&categoryId=${created.id}#category-${created.id}`);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/categories?error=duplicate-slug&${returnParams.toString()}`);
    }
    throw error;
  }
}

export async function deleteCategoryAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const id = String(formData.get("id") || "");
  const category = await db.category.findUnique({ where: { id } });
  if (!category) redirect("/admin/categories");
  await db.category.delete({ where: { id } });
  revalidatePath("/admin/categories");
  revalidatePath("/");
  revalidatePath(`/category/${category.slug}`);
  redirect("/admin/categories?deleted=category#categories");
}

export async function saveTypeAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const slug = slugify(String(formData.get("slug") || name));
  const description = String(formData.get("description") || "").trim();
  const returnParams = new URLSearchParams({
    name,
    slug: String(formData.get("slug") || "").trim(),
    description,
  });

  if (!name || !slug) {
    redirect(`/admin/types?error=missing&${returnParams.toString()}`);
  }

  if (id) {
    try {
      await db.recipeType.update({ where: { id }, data: { name, slug, description } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        redirect(`/admin/types/${id}?error=duplicate-slug`);
      }
      throw error;
    }
    revalidatePath(`/admin/types/${id}`);
    redirect(`/admin/types/${id}?saved=type`);
  }

  try {
    const created = await db.recipeType.create({
      data: {
        name,
        slug,
        description,
        fields: {
          create: CORE_FIELDS.map((field, index) => ({
            key: field.key,
            label: field.label,
            helpText: field.helpText || "",
            kind: field.kind,
            required: Boolean(field.required),
            options: JSON.stringify(field.options || []),
            sortOrder: index,
          })),
        },
      },
    });
    revalidatePath("/admin/types");
    redirect(`/admin/types/${created.id}`);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/types?error=duplicate&${returnParams.toString()}`);
    }
    throw error;
  }
}

export async function deleteTypeAction(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") || "");
  const used = await getDb().recipe.count({ where: { typeId: id } });
  if (used > 0) redirect("/admin/types?error=inuse");
  await getDb().recipeType.delete({ where: { id } });
  revalidatePath("/admin/types");
  redirect("/admin/types");
}

export async function saveFieldAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const typeId = String(formData.get("typeId") || "");
  const id = String(formData.get("id") || "");
  const label = String(formData.get("label") || "").trim();
  const kind = String(formData.get("kind") || "text");
  const helpText = String(formData.get("helpText") || "").trim();
  const required = formData.get("required") === "on";
  const options = String(formData.get("options") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!typeId || !label) {
    redirect(`/admin/types/${typeId}?error=missing-label`);
  }

  if (id) {
    const existing = await db.recipeTypeField.findUnique({ where: { id } });
    if (!existing || existing.typeId !== typeId) {
      redirect(`/admin/types/${typeId}`);
    }

    const coreDef = coreFieldDefinition(existing.key);
    const isSharedField = Boolean(coreDef);

    const recipes = await db.recipe.findMany({
      where: { typeId },
      select: { values: true },
    });
    const recipesWithData = countRecipesWithFieldContent(recipes, existing.key, existing.kind);

    const resolvedKind = isSharedField ? coreDef!.kind : kind;
    const resolvedOptions = isSharedField
      ? coreDef!.options || []
      : options;

    if (isSharedField && kind !== coreDef!.kind) {
      redirect(`/admin/types/${typeId}?error=shared-schema-locked&fieldId=${id}#field-${id}`);
    }

    if (!isSharedField && resolvedKind !== existing.kind && recipesWithData > 0) {
      redirect(`/admin/types/${typeId}?error=field-type-locked&fieldId=${id}#field-${id}`);
    }

    if (required && !existing.required) {
      const missing = countRecipesMissingFieldContent(recipes, existing.key, resolvedKind);
      if (missing > 0 && formData.get("confirmRequired") !== "1") {
        redirect(`/admin/types/${typeId}?error=require-confirm&fieldId=${id}#field-${id}`);
      }
    }

    await db.recipeTypeField.update({
      where: { id },
      data: {
        label,
        key: existing.key,
        kind: resolvedKind,
        helpText,
        required,
        options: JSON.stringify(resolvedOptions),
      },
    });
    revalidatePath(`/admin/types/${typeId}`);
    redirect(`/admin/types/${typeId}?saved=field&fieldId=${id}#field-${id}`);
  }

  const key = keyFromLabel(String(formData.get("key") || label));
  if (!key) {
    redirect(`/admin/types/${typeId}?error=invalid-key&add=1`);
  }

  if (isCoreFieldKey(key)) {
    redirect(`/admin/types/${typeId}?error=reserved-key&add=1`);
  }

  const duplicate = await db.recipeTypeField.findUnique({
    where: { typeId_key: { typeId, key } },
  });
  if (duplicate) {
    redirect(`/admin/types/${typeId}?error=duplicate-key&add=1`);
  }

  const last = await db.recipeTypeField.aggregate({
    where: { typeId },
    _max: { sortOrder: true },
  });
  const created = await db.recipeTypeField.create({
    data: {
      typeId,
      label,
      key,
      kind,
      helpText,
      required,
      options: JSON.stringify(options),
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/admin/types/${typeId}`);
  redirect(`/admin/types/${typeId}?saved=field&fieldId=${created.id}#field-${created.id}`);
}

export async function deleteFieldAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const id = String(formData.get("id") || "");
  const typeId = String(formData.get("typeId") || "");
  const field = await db.recipeTypeField.findUnique({ where: { id } });
  if (field && CORE_FIELDS.some((item) => item.key === field.key)) {
    redirect(`/admin/types/${typeId}?error=protected-field`);
  }
  if (!field || field.typeId !== typeId) {
    redirect(`/admin/types/${typeId}#fields`);
  }
  await db.recipeTypeField.delete({ where: { id } });
  revalidatePath(`/admin/types/${typeId}`);
  redirect(`/admin/types/${typeId}?deleted=field#fields`);
}

export async function moveFieldAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const typeId = String(formData.get("typeId") || "");
  const id = String(formData.get("id") || "");
  const direction = String(formData.get("direction") || "");
  const fields = await db.recipeTypeField.findMany({
    where: { typeId },
    orderBy: { sortOrder: "asc" },
  });
  const index = fields.findIndex((field) => field.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= fields.length) {
    redirect(`/admin/types/${typeId}#field-${id}`);
  }
  const current = fields[index];
  const other = fields[swapWith];
  await db.$transaction([
    db.recipeTypeField.update({ where: { id: current.id }, data: { sortOrder: other.sortOrder } }),
    db.recipeTypeField.update({ where: { id: other.id }, data: { sortOrder: current.sortOrder } }),
  ]);
  revalidatePath(`/admin/types/${typeId}`);
  redirect(`/admin/types/${typeId}?focus=${id}#field-${id}`);
}

function readDynamicValues(formData: FormData, fields: { key: string; kind: string }[]) {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = formData.get(`field:${field.key}`);
    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw);
        values[field.key] = isPlainStringListKind(field.kind) ? coerceStringList(parsed) : parsed;
      } catch {
        values[field.key] = isPlainStringListKind(field.kind) ? coerceStringList(raw) : raw;
      }
    } else {
      values[field.key] = emptyValue(field.kind);
    }
  }
  return values;
}

export async function saveRecipeAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const id = String(formData.get("id") || "");
  const typeId = String(formData.get("typeId") || "");
  const title = String(formData.get("title") || "").trim();
  const slug = slugify(String(formData.get("slug") || title));
  const excerpt = String(formData.get("excerpt") || "");
  const status = String(formData.get("status") || "draft");
  const featured = formData.get("featured") === "on";
  const seasonal = formData.get("seasonal") === "on";
  const categoryIds = formData.getAll("categoryIds").map(String);

  if (!title || !slug || !typeId) {
    redirect(id ? `/admin/recipes/${id}?error=missing` : `/admin/recipes/new?type=${typeId}&error=missing`);
  }

  const fields = await db.recipeTypeField.findMany({
    where: { typeId },
    orderBy: { sortOrder: "asc" },
  });
  const values = readDynamicValues(formData, fields);
  // Legacy rows may only have bakeMinutes; keep cookMinutes aligned when cook was never set.
  if (typeof values.bakeMinutes === "number" && values.cookMinutes == null) {
    values.cookMinutes = values.bakeMinutes;
  }

  const instructionGroups = normalizeInstructionGroups(values.instructions);
  const youtubeBlob = parseRecipeYoutubeBlob(values.youtube);
  const videoDurationSeconds = youtubeBlob?.duration
    ? parseTimestampInput(String(youtubeBlob.duration)) ?? undefined
    : undefined;
  const chapterValidation = validateInstructionChapters({
    groups: instructionGroups,
    videoDurationSeconds,
  });
  const chapterErrors = chapterValidation.filter((issue) => issue.severity === "error");
  if (chapterErrors.length) {
    const message = chapterErrors[0]?.message ?? "Instruction chapter timestamps are invalid.";
    redirect(
      id
        ? `/admin/recipes/${id}?error=chapters&detail=${encodeURIComponent(message)}`
        : `/admin/recipes/new?type=${typeId}&error=chapters&detail=${encodeURIComponent(message)}`,
    );
  }

  Object.assign(values, enrichRecipeValuesWithDerivedChapters(values));

  try {
    await enrichRecipeValuesYoutubeFromDescription(values);
  } catch (error) {
    console.error("Could not enrich YouTube chapters from video description", error);
  }

  const existing = id ? await db.recipe.findUnique({ where: { id } }) : null;
  const aiMetaRaw = String(formData.get("aiMeta") || "{}");
  let aiMeta = "{}";
  try {
    const parsed = JSON.parse(aiMetaRaw || "{}") as unknown;
    if (parsed && typeof parsed === "object") {
      aiMeta = JSON.stringify(parsed);
    }
  } catch {
    aiMeta = existing?.aiMeta || "{}";
  }

  const actor = await getAdminSession();
  const staffIdentity = actor?.email || actor?.name || actor?.id || "unknown";
  const schemaFields = fields.map(
    (field): import("@/lib/ai-recipe/schema-version").SchemaField => ({
      key: field.key,
      label: field.label,
      kind: field.kind,
      required: field.required,
      helpText: field.helpText,
      options: JSON.parse(field.options || "[]") as string[],
    }),
  );
  const staffVerifyResult = applyServerStaffVerification({
    aiMetaRaw: aiMeta,
    previousAiMetaRaw: existing?.aiMeta,
    staffIdentity,
    title,
    excerpt,
    categoryIds,
    values,
    fields: schemaFields,
  });
  aiMeta = staffVerifyResult.aiMeta;

  const data = {
    title,
    slug,
    excerpt,
    typeId,
    status,
    featured,
    seasonal,
    publishedAt:
      status === "published" ? (existing?.publishedAt ?? new Date()) : null,
    values: JSON.stringify(values),
    aiMeta,
  };

  const recipe = id
    ? await db.recipe.update({ where: { id }, data })
    : await db.recipe.create({ data });

  await db.recipeCategory.deleteMany({ where: { recipeId: recipe.id } });
  if (categoryIds.length) {
    await db.recipeCategory.createMany({
      data: categoryIds.map((categoryId) => ({ recipeId: recipe.id, categoryId })),
    });
  }

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${slug}`);
  redirect(`/admin/recipes/${recipe.id}?saved=1`);
}

export async function deleteRecipeAction(formData: FormData) {
  await requireEditor();
  await getDb().recipe.delete({ where: { id: String(formData.get("id") || "") } });
  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin");
}

export async function saveAdminAction(formData: FormData) {
  const actor = await requireAccess("staff");
  const db = getDb();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const email = normalizeAdminEmail(String(formData.get("email") || ""));
  const password = String(formData.get("password") || "");
  const roleRaw = String(formData.get("role") || "editor");
  const photoUrl = String(formData.get("photoUrl") || "").trim();

  const staffRedirect = (query: string): never => {
    redirect(`/admin/staff?${query}`);
  };

  if (!name || !email || !isAccessLevel(roleRaw)) {
    staffRedirect(id ? `error=missing&admin=${encodeURIComponent(id)}` : "error=missing");
  }
  if (!isValidAdminEmail(email)) {
    staffRedirect(id ? `error=email&admin=${encodeURIComponent(id)}` : "error=email");
  }
  if (isReservedSystemOwnerEmail(email)) {
    staffRedirect(id ? `error=owner-email&admin=${encodeURIComponent(id)}` : "error=owner-email");
  }
  if (!isAcceptableAdminPassword(password, { required: !id })) {
    staffRedirect(id ? `error=password&admin=${encodeURIComponent(id)}` : "error=password");
  }

  const duplicate = await db.admin.findFirst({
    where: {
      email,
      ...(id ? { NOT: { id } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    staffRedirect(id ? `error=exists&admin=${encodeURIComponent(id)}` : "error=exists");
  }

  const ownerCount = await db.admin.count({ where: { role: "owner" } });

  if (id) {
    const existing = await db.admin.findUnique({ where: { id } });
    if (!existing) {
      staffRedirect("error=missing");
    }

    const roleCheck = validateAdminRoleChange({
      actorId: actor.id,
      actorEmail: normalizeAdminEmail(actor.email),
      targetId: id,
      targetEmail: existing!.email,
      currentRole: existing!.role,
      nextRole: roleRaw,
      ownerCount,
    });
    if (!roleCheck.ok) {
      staffRedirect(`error=${roleCheck.error}&admin=${encodeURIComponent(id)}`);
    }

    const passwordChanging = Boolean(password && shouldUpdateAdminPassword(password));
    await db.admin.update({
      where: { id },
      data: {
        name,
        email,
        role: roleCheck.ok ? roleCheck.role : existing!.role,
        photoUrl,
        ...(passwordChanging
          ? {
              passwordHash: hashPassword(password),
              sessionVersion: { increment: 1 },
            }
          : {}),
      },
    });

    if ((existing!.photoUrl || "") && (existing!.photoUrl || "") !== photoUrl) {
      const { deleteOwnedAdminImage } = await import("@/lib/admin-upload-store");
      await deleteOwnedAdminImage(existing!.photoUrl || "");
    }

    await removeMemberByEmail(email);
    revalidatePath("/admin/members");
    revalidatePath("/admin/staff");
    revalidatePath("/admin", "layout");
    staffRedirect(`saved=1&admin=${encodeURIComponent(id)}`);
  }

  await db.admin.create({
    data: {
      name,
      email,
      role: roleRaw,
      photoUrl,
      passwordHash: hashPassword(password),
    },
  });

  await removeMemberByEmail(email);
  revalidatePath("/admin/members");
  revalidatePath("/admin/staff");
  revalidatePath("/admin", "layout");
  staffRedirect("created=1");
}

export async function deleteMemberAction(formData: FormData) {
  const admin = await requireAccess("members");
  if (!canDeleteMembers(admin.role)) {
    redirect("/admin/members");
  }
  const id = String(formData.get("id") || "");
  if (!id) redirect("/admin/members");
  try {
    await getDb().user.delete({ where: { id } });
  } catch {
    redirect("/admin/members");
  }
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${id}`);
  revalidatePath("/profile");
  redirect("/admin/members?removed=1");
}

export type DeleteMembersBulkResult =
  | { ok: true; deletedCount: number }
  | {
      ok: false;
      error: "missing" | "not-found" | "failed" | "too-many" | "forbidden";
    };

/**
 * Bulk member delete — Owner only (same gate as deleteMemberAction).
 * Cascades match single delete (saves/connections/presence); reviews SetNull.
 * All selected IDs must exist or the transaction aborts (no partial delete).
 */
export async function deleteMembersAction(
  memberIds: string[],
): Promise<DeleteMembersBulkResult> {
  const admin = await requireAccess("members");
  if (!canDeleteMembers(admin.role)) {
    return { ok: false, error: "forbidden" };
  }
  const ids = normalizeMemberIds(memberIds);
  if (!ids.length) return { ok: false, error: "missing" };
  if (ids.length > MEMBER_BULK_DELETE_MAX) {
    return { ok: false, error: "too-many" };
  }

  try {
    const deletedCount = await getDb().$transaction(async (tx) => {
      const existing = await tx.user.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (existing.length !== ids.length) {
        throw new Error("MEMBER_DELETE_INCOMPLETE");
      }
      const result = await tx.user.deleteMany({
        where: { id: { in: ids } },
      });
      return result.count;
    });
    if (deletedCount === 0) return { ok: false, error: "not-found" };
    revalidatePath("/admin/members");
    for (const id of ids) {
      revalidatePath(`/admin/members/${id}`);
    }
    revalidatePath("/profile");
    return { ok: true, deletedCount };
  } catch (error) {
    if (error instanceof Error && error.message === "MEMBER_DELETE_INCOMPLETE") {
      return { ok: false, error: "not-found" };
    }
    console.error("Could not delete members", error);
    return { ok: false, error: "failed" };
  }
}

export type DeleteGuestVisitorResult =
  | { ok: true }
  | { ok: false; error: "missing" | "not-found" | "failed" | "forbidden" };

export type DeleteGuestVisitorsBulkResult =
  | { ok: true; deletedCount: number }
  | { ok: false; error: "missing" | "not-found" | "failed" | "forbidden" };

export async function deleteGuestVisitorsAction(
  visitorIds: string[],
): Promise<DeleteGuestVisitorsBulkResult> {
  const admin = await requireAccess("members");
  if (!canDeleteGuestVisitors(admin.role)) {
    return { ok: false, error: "forbidden" };
  }
  const ids = normalizeGuestVisitorIds(visitorIds);
  if (!ids.length) return { ok: false, error: "missing" };

  try {
    const deletedCount = await deleteGuestVisitorsForAdmin(ids);
    if (deletedCount === 0) return { ok: false, error: "not-found" };
    revalidatePath("/admin/visitors");
    for (const id of ids) {
      revalidatePath(`/admin/visitors/${id}`);
    }
    return { ok: true, deletedCount };
  } catch (error) {
    console.error("Could not delete guest visitors", error);
    return { ok: false, error: "failed" };
  }
}

export async function deleteGuestVisitorAction(
  visitorId: string,
): Promise<DeleteGuestVisitorResult> {
  const result = await deleteGuestVisitorsAction([visitorId]);
  if (!result.ok) return result;
  return { ok: true };
}

export async function deleteAdminAction(formData: FormData) {
  const actor = await requireAccess("staff");
  const id = String(formData.get("id") || "");
  const db = getDb();
  const existing = await db.admin.findUnique({ where: { id } });
  if (!existing) redirect("/admin/staff?error=missing");

  const ownerCount = await db.admin.count({ where: { role: "owner" } });
  const check = validateAdminDeletion({
    actorId: actor.id,
    targetId: existing.id,
    targetRole: existing.role,
    ownerCount,
  });
  if (!check.ok) {
    redirect(`/admin/staff?error=${check.error}&admin=${encodeURIComponent(id)}`);
  }

  await db.admin.delete({ where: { id } });
  revalidatePath("/admin/staff");
  revalidatePath("/admin", "layout");
  redirect("/admin/staff?removed=1");
}

export async function saveOwnAdminProfileAction(formData: FormData) {
  const actor = await getAdminSession();
  if (!actor) redirect("/admin/login");

  const db = getDb();
  let adminId = actor.id;
  if (actor.id === "env") {
    const email = actor.email.trim().toLowerCase();
    const existing = await db.admin.findUnique({ where: { email } });
    if (!existing) {
      redirect("/admin/profile?error=named");
    }
    adminId = existing.id;
  }

  const current = await db.admin.findUnique({
    where: { id: adminId },
    select: { photoUrl: true },
  });
  if (!current) redirect("/admin/profile?error=named");

  const previousUrl = current.photoUrl || "";
  const removePhoto = String(formData.get("removePhoto") || "") === "1";
  const fileEntry = formData.get("photoFile");
  const file =
    typeof fileEntry === "object" &&
    fileEntry !== null &&
    "arrayBuffer" in fileEntry &&
    typeof (fileEntry as Blob).arrayBuffer === "function" &&
    typeof (fileEntry as Blob).size === "number" &&
    (fileEntry as Blob).size > 0
      ? (fileEntry as Blob)
      : null;
  const photoUrlField = String(formData.get("photoUrl") || "").trim();
  let nextUrl = previousUrl;
  let uploadedUrl = "";

  try {
    if (removePhoto) {
      // Drop custom override; prefer Google avatar from the current OAuth session when available.
      const { auth } = await import("@/auth");
      const { isGooglePhotoUrl } = await import("@/lib/accounts");
      const session = await auth();
      const googleImage = session?.user?.image?.trim() || "";
      if (isGooglePhotoUrl(previousUrl)) {
        nextUrl = "";
      } else if (isGooglePhotoUrl(googleImage)) {
        nextUrl = googleImage;
      } else {
        nextUrl = "";
      }
    } else if (file) {
      const { storeAdminImage } = await import("@/lib/admin-upload-store");
      const hint = file instanceof File && file.name ? file.name : "photo";
      uploadedUrl = await storeAdminImage(file, "admins", hint);
      nextUrl = uploadedUrl;
    } else if (photoUrlField) {
      // URL already uploaded via /api/admin/upload — only accept app-owned assets.
      const { isOwnedAdminUploadUrl } = await import("@/lib/admin-upload");
      if (!isOwnedAdminUploadUrl(photoUrlField)) {
        redirect("/admin/profile?error=upload");
      }
      nextUrl = photoUrlField;
    } else {
      redirect("/admin/profile");
    }

    await db.admin.update({ where: { id: adminId }, data: { photoUrl: nextUrl } });

    if (previousUrl && previousUrl !== nextUrl) {
      const { deleteOwnedAdminImage } = await import("@/lib/admin-upload-store");
      await deleteOwnedAdminImage(previousUrl);
    }
  } catch (error) {
    // redirect() throws — rethrow so Next.js can navigate
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    if (uploadedUrl) {
      const { deleteOwnedAdminImage } = await import("@/lib/admin-upload-store");
      await deleteOwnedAdminImage(uploadedUrl);
    }
    console.error("Could not save admin profile photo", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("not configured")) {
      redirect("/admin/profile?error=storage");
    }
    redirect("/admin/profile?error=upload");
  }

  revalidatePath("/admin/profile");
  revalidatePath("/admin/staff");
  revalidatePath("/recipes", "layout");
  redirect("/admin/profile?saved=1");
}

export async function deleteReviewAction(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") || "");
  if (!id) redirect("/admin/reviews");
  const { deleteReviewById } = await import("@/lib/recipe-reviews");
  const slug = await deleteReviewById(id);
  if (!slug) redirect("/admin/reviews?error=missing");
  revalidatePath(`/recipes/${slug}`);
  revalidatePath("/admin/reviews");
  redirect("/admin/reviews?removed=1");
}

export async function deleteReviewReplyAction(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") || "");
  if (!id) redirect("/admin/reviews");
  const { deleteReviewReplyById } = await import("@/lib/recipe-reviews");
  const slug = await deleteReviewReplyById(id);
  if (!slug) redirect("/admin/reviews?error=missing");
  revalidatePath(`/recipes/${slug}`);
  revalidatePath("/admin/reviews");
  redirect("/admin/reviews?replyRemoved=1");
}

export async function replyToReviewAction(formData: FormData) {
  const admin = await requireAccess("content");
  const reviewId = String(formData.get("reviewId") || "").trim();
  const body = String(formData.get("body") || "");
  const pageRaw = String(formData.get("page") || "1").trim();
  const page = Number.parseInt(pageRaw, 10);

  if (!reviewId) redirect("/admin/reviews?error=missing");

  try {
    const { submitAdminRecipeReviewReply } = await import("@/lib/recipe-reviews");
    const slug = await submitAdminRecipeReviewReply({
      reviewId,
      body,
      admin: {
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
    if (!slug) redirect("/admin/reviews?error=missing");
    revalidatePath(`/recipes/${slug}`);
    revalidatePath("/admin/reviews");
    const params = new URLSearchParams({ replied: "1" });
    if (Number.isFinite(page) && page > 1) params.set("page", String(page));
    redirect(`/admin/reviews?${params.toString()}`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("Could not post admin review reply", error);
    const params = new URLSearchParams({ error: "reply" });
    if (Number.isFinite(page) && page > 1) params.set("page", String(page));
    redirect(`/admin/reviews?${params.toString()}`);
  }
}

export async function syncYoutubeAction() {
  const admin = await requireAccess("youtube");
  if (!canManageYoutubeSync(admin.role)) {
    return { ok: false as const, videosSynced: 0, snapshotCreated: false, error: "Only owners can sync YouTube." };
  }

  const result = await syncYoutubeChannel({ forceSnapshot: true });
  revalidatePath("/admin/youtube");
  return result;
}

export async function disconnectYoutubeAnalyticsAction() {
  const admin = await requireAccess("youtube");
  if (!canManageYoutubeAnalytics(admin.role)) {
    return { ok: false as const, error: "Only owners can disconnect YouTube Analytics." };
  }
  const { disconnectAnalyticsConnection } = await import("@/lib/youtube-analytics/connection");
  await disconnectAnalyticsConnection();
  revalidatePath("/admin/youtube");
  return { ok: true as const };
}

export async function syncYoutubeAnalyticsAction() {
  const admin = await requireAccess("youtube");
  if (!canManageYoutubeAnalytics(admin.role)) {
    return { ok: false as const, error: "Only owners can refresh YouTube Analytics." };
  }
  const { syncYoutubeAnalytics } = await import("@/lib/youtube-analytics/sync");
  const result = await syncYoutubeAnalytics({ days: 90 });
  revalidatePath("/admin/youtube");
  revalidatePath("/admin/youtube", "layout");
  return result;
}

export async function clearRecipeYoutubeLinkAction(recipeId: string) {
  await requireEditor();
  const id = String(recipeId || "").trim();
  if (!id) return { ok: false as const, error: "Recipe id is required." };

  const cleared = await clearRecipeYoutubeLinkInDb(id);
  if (!cleared) return { ok: false as const, error: "Recipe not found." };

  revalidatePath("/admin");
  revalidatePath("/admin/youtube");
  return { ok: true as const };
}

export async function createRecipeFromYoutubeVideoAction(formData: FormData) {
  await requireEditor();
  const typeId = String(formData.get("typeId") || "").trim();
  const videoId = String(formData.get("videoId") || "").trim();
  const typeSourceRaw = String(formData.get("typeSource") || "manual").trim();
  const typeSource = typeSourceRaw === "ai" ? "ai" : "manual";
  const typeConfidence = String(formData.get("typeConfidence") || "LOW").trim().toUpperCase();
  const confidence: RecipeTypeConfidence =
    typeConfidence === "HIGH" || typeConfidence === "MEDIUM" || typeConfidence === "LOW"
      ? typeConfidence
      : "LOW";

  if (!typeId || !videoId) {
    redirect(`/admin/youtube/videos/${videoId || ""}?error=missing-recipe-type`);
  }

  const result = await createAndPopulateRecipeFromYoutubeVideo({
    videoId,
    typeId,
    typeSource,
    typeConfidence: confidence,
  });

  if (!result.ok) {
    redirect(`/admin/youtube/videos/${videoId}?error=${encodeURIComponent(result.code)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/youtube");
  revalidatePath(`/admin/recipes/${result.recipeId}`);

  const params = new URLSearchParams();
  if (!result.analysisOk) {
    params.set(
      "aiNotice",
      result.analysisMessage ||
        "Draft created, but AI analysis could not be completed. You can regenerate the analysis or edit the recipe manually.",
    );
  }
  const qs = params.toString();
  redirect(`/admin/recipes/${result.recipeId}${qs ? `?${qs}` : ""}`);
}

type SeriesItemPayload = {
  id?: string;
  recipeId?: string;
  youtubeVideoId?: string;
  customTitle?: string;
  customDescription?: string;
  featured?: boolean;
  removedFromPlaylist?: boolean;
};

function parseSeriesItemsJson(raw: string): SeriesItemPayload[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const row = item as SeriesItemPayload;
      return {
        id: String(row.id || "").trim() || undefined,
        recipeId: String(row.recipeId || "").trim(),
        youtubeVideoId: String(row.youtubeVideoId || "").trim(),
        customTitle: String(row.customTitle || "").trim(),
        customDescription: String(row.customDescription || "").trim(),
        featured: Boolean(row.featured),
        removedFromPlaylist: Boolean(row.removedFromPlaylist),
      };
    });
  } catch {
    return [];
  }
}

export async function saveSeriesAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const id = String(formData.get("id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const shortTitle = String(formData.get("shortTitle") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const intro = String(formData.get("intro") || "").trim();
  const heroImage = String(formData.get("heroImage") || "").trim();
  const heroImageSourceRaw = String(formData.get("heroImageSource") || "").trim();
  const seoTitle = String(formData.get("seoTitle") || "").trim();
  const seoDescription = String(formData.get("seoDescription") || "").trim();
  const followYoutubeOrder = String(formData.get("followYoutubeOrder") || "") === "1";
  const isPublished = String(formData.get("isPublished") || "") === "1";
  const sortOrder = Number(formData.get("sortOrder") || 0) || 0;
  const aiMetaRaw = String(formData.get("aiMetaJson") || "").trim();
  const featuredChosenByHuman = String(formData.get("featuredChosenByHuman") || "") === "1";
  const items = parseSeriesItemsJson(String(formData.get("itemsJson") || "[]")).filter(
    (item) => item.recipeId || item.youtubeVideoId,
  );

  if (!title) {
    redirect(id ? `/admin/series/${id}?error=missing-title` : "/admin/series/new?error=missing-title");
  }

  let featuredSeen = false;
  const normalizedItems = items.map((item, index) => {
    let featured = Boolean(item.featured);
    if (featured && featuredSeen) featured = false;
    if (featured) featuredSeen = true;
    return {
      id: item.id,
      recipeId: item.recipeId || null,
      youtubeVideoId: item.youtubeVideoId || null,
      customTitle: item.customTitle || "",
      customDescription: item.customDescription || "",
      featured,
      sortOrder: index,
      removedFromPlaylist: Boolean(item.removedFromPlaylist),
    };
  });

  for (const item of normalizedItems) {
    if (item.recipeId) {
      const ok = await db.recipe.findUnique({ where: { id: item.recipeId }, select: { id: true } });
      if (!ok) item.recipeId = null;
    }
    if (item.youtubeVideoId) {
      const ok = await db.youTubeVideo.findUnique({
        where: { videoId: item.youtubeVideoId },
        select: { videoId: true },
      });
      if (!ok) item.youtubeVideoId = null;
    }
  }
  const validItems = normalizedItems.filter((item) => item.recipeId || item.youtubeVideoId);

  if (id) {
    const existing = await db.series.findUnique({ where: { id } });
    if (!existing) redirect("/admin/series");

    // Preserve playlist snapshot fields; only Mesa editorial + order mode are editable here.
    const isYoutube = existing.syncMode === "YOUTUBE" || Boolean(existing.youtubePlaylistId);
    const previousHero = existing.heroImage.trim();
    let heroImageSource = existing.heroImageSource || "";
    if (heroImage && heroImage !== previousHero) {
      // Treat any hero change from the editor as manual unless still empty.
      heroImageSource = "manual";
    } else if (!heroImage) {
      heroImageSource = "";
    } else if (heroImageSourceRaw === "manual" || heroImageSource === "manual") {
      heroImageSource = "manual";
    }

    let aiMetaJson = existing.aiMeta || "{}";
    if (aiMetaRaw) {
      try {
        const parsed = JSON.parse(aiMetaRaw) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
          parsed.featuredChosenByHuman =
            featuredChosenByHuman || Boolean(parsed.featuredChosenByHuman);
          aiMetaJson = JSON.stringify(parsed);
        }
      } catch {
        // keep existing
      }
    } else if (featuredChosenByHuman) {
      try {
        const parsed = JSON.parse(existing.aiMeta || "{}") as Record<string, unknown>;
        parsed.featuredChosenByHuman = true;
        aiMetaJson = JSON.stringify(parsed);
      } catch {
        // ignore
      }
    }

    await db.$transaction(async (tx) => {
      await tx.seriesItem.deleteMany({ where: { seriesId: id } });
      await tx.series.update({
        where: { id },
        data: {
          title,
          slug: existing.slug,
          shortTitle,
          description,
          intro,
          heroImage,
          heroImageSource,
          seoTitle,
          seoDescription,
          followYoutubeOrder: isYoutube ? followYoutubeOrder : false,
          aiMeta: aiMetaJson,
          // Never clear/overwrite YouTube playlist snapshots from this form.
          isPublished,
          sortOrder,
          items: {
            create: validItems.map((item) => ({
              // Preserve stable IDs so AI provenance paths stay valid across saves.
              ...(item.id ? { id: item.id } : {}),
              recipeId: item.recipeId,
              youtubeVideoId: item.youtubeVideoId,
              customTitle: item.customTitle,
              customDescription: item.customDescription,
              featured: item.featured,
              sortOrder: item.sortOrder,
              removedFromPlaylist: item.removedFromPlaylist,
            })),
          },
        },
      });
    });
    revalidatePath("/admin/series");
    revalidatePath(`/admin/series/${id}`);
    revalidatePath("/series");
    revalidatePath(`/series/${existing.slug}`);
    redirect(`/admin/series/${id}?saved=1`);
  }

  const slug = slugify(String(formData.get("slug") || title));
  if (!slug) redirect("/admin/series/new?error=invalid-slug");

  try {
    const created = await db.series.create({
      data: {
        title,
        slug,
        shortTitle,
        description,
        intro,
        heroImage,
        seoTitle,
        seoDescription,
        syncMode: "CUSTOM",
        followYoutubeOrder: false,
        youtubePlaylistId: "",
        isPublished,
        sortOrder,
        items: {
          create: validItems.map((item) => ({
            recipeId: item.recipeId,
            youtubeVideoId: item.youtubeVideoId,
            customTitle: item.customTitle,
            customDescription: item.customDescription,
            featured: item.featured,
            sortOrder: item.sortOrder,
            removedFromPlaylist: false,
          })),
        },
      },
    });
    revalidatePath("/admin/series");
    revalidatePath("/series");
    if (isPublished) revalidatePath(`/series/${created.slug}`);
    redirect(`/admin/series/${created.id}?saved=1`);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect("/admin/series/new?error=duplicate-slug");
    }
    throw error;
  }
}

export async function deleteSeriesAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/series");
  const existing = await db.series.findUnique({ where: { id }, select: { slug: true } });
  if (!existing) redirect("/admin/series");
  await db.series.delete({ where: { id } });
  revalidatePath("/admin/series");
  revalidatePath("/series");
  revalidatePath(`/series/${existing.slug}`);
  redirect("/admin/series?deleted=1");
}

export async function importYoutubePlaylistAction(formData: FormData) {
  await requireEditor();
  const playlistId = String(formData.get("playlistId") || "").trim();
  if (!playlistId) redirect("/admin/series/import?error=missing-playlist");
  try {
    const { importYoutubePlaylistAsSeries } = await import("@/lib/series-playlist");
    const result = await importYoutubePlaylistAsSeries(playlistId);
    revalidatePath("/admin/series");
    revalidatePath("/series");

    const qs = new URLSearchParams({
      imported: "1",
      videos: String(result.videoCount),
      linked: String(result.linkedRecipeCount),
      videoOnly: String(result.videoOnlyCount),
      skipped: String(result.skippedUnavailable),
    });

    // Best-effort AI editorial draft — import must succeed even if Gemini fails.
    try {
      const { generateSeriesEditorialDraft } = await import("@/lib/series-ai/generate");
      const editorial = await generateSeriesEditorialDraft({
        seriesId: result.seriesId,
        mode: "fill_empty",
      });
      if (editorial.ok) qs.set("editorial", "1");
      else {
        qs.set("editorialError", "1");
        qs.set("editorialMessage", (editorial.message || "AI draft failed").slice(0, 160));
      }
    } catch (error) {
      qs.set("editorialError", "1");
      qs.set(
        "editorialMessage",
        (error instanceof Error ? error.message : "AI draft failed").slice(0, 160),
      );
    }

    redirect(`/admin/series/${result.seriesId}?${qs.toString()}`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message =
      error instanceof Error ? error.message.slice(0, 180) : "import-failed";
    redirect(`/admin/series/import?error=${encodeURIComponent(message)}`);
  }
}

export async function refreshSeriesFromYoutubeAction(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/series");
  try {
    const { refreshSeriesFromYoutubePlaylist } = await import("@/lib/series-playlist");
    const result = await refreshSeriesFromYoutubePlaylist(id);
    revalidatePath("/admin/series");
    revalidatePath(`/admin/series/${id}`);
    revalidatePath("/series");
    const series = await getDb().series.findUnique({ where: { id }, select: { slug: true } });
    if (series) revalidatePath(`/series/${series.slug}`);
    const qs = new URLSearchParams({
      refreshed: "1",
      added: String(result.added),
      removed: String(result.removedMarked),
      restored: String(result.restored),
      reordered: result.reordered ? "1" : "0",
    });
    redirect(`/admin/series/${id}?${qs.toString()}`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message =
      error instanceof Error ? error.message.slice(0, 180) : "refresh-failed";
    redirect(`/admin/series/${id}?error=${encodeURIComponent(message)}`);
  }
}

export async function linkSeriesToYoutubePlaylistAction(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") || "").trim();
  const playlistId = String(formData.get("playlistId") || "").trim();
  if (!id) redirect("/admin/series");
  if (!playlistId) redirect(`/admin/series/${id}?error=missing-playlist`);
  try {
    const { linkCustomSeriesToYoutubePlaylist } = await import("@/lib/series-playlist");
    await linkCustomSeriesToYoutubePlaylist(id, playlistId);
    revalidatePath("/admin/series");
    revalidatePath(`/admin/series/${id}`);
    revalidatePath("/series");
    redirect(`/admin/series/${id}?playlistLinked=1`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message =
      error instanceof Error ? error.message.slice(0, 180) : "link-failed";
    redirect(`/admin/series/${id}?error=${encodeURIComponent(message)}`);
  }
}

export async function removeSeriesItemAction(formData: FormData) {
  await requireEditor();
  const seriesId = String(formData.get("seriesId") || "").trim();
  const itemId = String(formData.get("itemId") || "").trim();
  if (!seriesId || !itemId) redirect("/admin/series");
  const { deleteSeriesItemPermanently } = await import("@/lib/series-playlist");
  await deleteSeriesItemPermanently(itemId);
  revalidatePath(`/admin/series/${seriesId}`);
  revalidatePath("/admin/series");
  revalidatePath("/series");
  redirect(`/admin/series/${seriesId}?saved=1`);
}

export async function saveStudioLessonLinksAction(formData: FormData) {
  await requireAccess("content");
  const lessonSlug = String(formData.get("lessonSlug") || "").trim();
  const recipeIds = formData.getAll("recipeIds").map((value) => String(value).trim()).filter(Boolean);
  const { replaceStudioLessonRecipeLinks } = await import("@/lib/studio-recipe-links");
  await replaceStudioLessonRecipeLinks({ lessonSlug, recipeIds });
  revalidatePath("/admin/studio");
  revalidatePath("/studio");
  revalidatePath(`/studio/${lessonSlug}`);
  revalidatePath("/recipes", "layout");
  redirect("/admin/studio?saved=1");
}

export async function saveHomepageCurationAction(formData: FormData) {
  await requireAccess("content");
  const clear = String(formData.get("clear") || "") === "1";
  const {
    setSiteSetting,
    SITE_SETTING_KEYS,
    serializeHomepageFromKitchenSlugs,
  } = await import("@/lib/site-settings");

  if (clear) {
    await setSiteSetting(SITE_SETTING_KEYS.homepageFeaturedRecipeSlug, "");
    await setSiteSetting(SITE_SETTING_KEYS.homepageFromKitchenRecipeSlugs, "[]");
  } else {
    const featuredSlug = String(formData.get("featuredRecipeSlug") || "").trim();
    const kitchenSlugs = [
      String(formData.get("fromKitchenSlug0") || "").trim(),
      String(formData.get("fromKitchenSlug1") || "").trim(),
      String(formData.get("fromKitchenSlug2") || "").trim(),
    ].filter(Boolean);

    const uniqueKitchen: string[] = [];
    for (const slug of kitchenSlugs) {
      if (slug === featuredSlug) continue;
      if (uniqueKitchen.includes(slug)) continue;
      uniqueKitchen.push(slug);
    }

    await setSiteSetting(SITE_SETTING_KEYS.homepageFeaturedRecipeSlug, featuredSlug);
    await setSiteSetting(
      SITE_SETTING_KEYS.homepageFromKitchenRecipeSlugs,
      serializeHomepageFromKitchenSlugs(uniqueKitchen),
    );
  }

  revalidatePath("/");
  revalidatePath("/admin/studio");
  redirect("/admin/studio?featuredSaved=1");
}

/** @deprecated Use saveHomepageCurationAction */
export async function saveHomepageFeaturedRecipeAction(formData: FormData) {
  return saveHomepageCurationAction(formData);
}

export async function keepRemovedSeriesItemAction(formData: FormData) {
  await requireEditor();
  const seriesId = String(formData.get("seriesId") || "").trim();
  const itemId = String(formData.get("itemId") || "").trim();
  if (!seriesId || !itemId) redirect("/admin/series");
  const { keepRemovedSeriesItemInSeries } = await import("@/lib/series-playlist");
  await keepRemovedSeriesItemInSeries(itemId);
  revalidatePath(`/admin/series/${seriesId}`);
  redirect(`/admin/series/${seriesId}?saved=1`);
}
