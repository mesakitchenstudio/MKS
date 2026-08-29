"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { homeForRole, isAccessLevel } from "@/lib/admin-access";
import { clearAdminLoginFailures, isAdminLoginBlocked, recordAdminLoginFailure } from "@/lib/admin-login-guard";
import { authenticateAdmin, clearAllAuthCookies, getAdminSession, requireAccess, writeAdminSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CORE_FIELDS, emptyValue, keyFromLabel, slugify } from "@/lib/fields";
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
import { removeMemberByEmail } from "@/lib/accounts";
import { deleteGuestVisitorsForAdmin } from "@/lib/guest-analytics";
import { normalizeGuestVisitorIds } from "@/lib/guest-tracking";
import { connectionMeta } from "@/lib/request-meta";

async function requireEditor() {
  await requireAccess("content");
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
        values[field.key] = JSON.parse(raw);
      } catch {
        values[field.key] = raw;
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
  if (typeof values.bakeMinutes === "number") {
    values.cookMinutes = values.bakeMinutes;
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
  await requireAccess("members");
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

export type DeleteGuestVisitorResult =
  | { ok: true }
  | { ok: false; error: "missing" | "not-found" | "failed" };

export type DeleteGuestVisitorsBulkResult =
  | { ok: true; deletedCount: number }
  | { ok: false; error: "missing" | "not-found" | "failed" };

export async function deleteGuestVisitorsAction(
  visitorIds: string[],
): Promise<DeleteGuestVisitorsBulkResult> {
  await requireAccess("members");
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
  redirect("/admin/reviews?removed=1");
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
