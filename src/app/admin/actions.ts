"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { homeForRole, isAccessLevel } from "@/lib/admin-access";
import { clearAdminLoginFailures, isAdminLoginBlocked, recordAdminLoginFailure } from "@/lib/admin-login-guard";
import { ADMIN_COOKIE, authenticateAdmin, getAdminSession, requireAccess, writeAdminSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CORE_FIELDS, emptyValue, keyFromLabel, slugify } from "@/lib/fields";
import { hashPassword } from "@/lib/passwords";
import { removeMemberByEmail } from "@/lib/accounts";
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
  jar.delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

export async function saveCategoryAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const slug = slugify(String(formData.get("slug") || name));
  const description = String(formData.get("description") || "");
  const group = String(formData.get("group") || "course");
  if (!name || !slug) redirect("/admin/categories?error=missing");

  if (id) {
    await db.category.update({ where: { id }, data: { name, slug, description, group } });
  } else {
    await db.category.create({ data: { name, slug, description, group } });
  }
  revalidatePath("/admin/categories");
  revalidatePath("/");
  redirect("/admin/categories");
}

export async function deleteCategoryAction(formData: FormData) {
  await requireEditor();
  await getDb().category.delete({ where: { id: String(formData.get("id") || "") } });
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

export async function saveTypeAction(formData: FormData) {
  await requireEditor();
  const db = getDb();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const slug = slugify(String(formData.get("slug") || name));
  const description = String(formData.get("description") || "");
  if (!name || !slug) redirect("/admin/types?error=missing");

  if (id) {
    await db.recipeType.update({ where: { id }, data: { name, slug, description } });
    revalidatePath(`/admin/types/${id}`);
    redirect(`/admin/types/${id}`);
  }

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
  const key = keyFromLabel(String(formData.get("key") || label));
  const kind = String(formData.get("kind") || "text");
  const helpText = String(formData.get("helpText") || "");
  const required = formData.get("required") === "on";
  const options = String(formData.get("options") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!typeId || !label || !key) redirect(`/admin/types/${typeId}`);

  if (id) {
    await db.recipeTypeField.update({
      where: { id },
      data: { label, key, kind, helpText, required, options: JSON.stringify(options) },
    });
  } else {
    const last = await db.recipeTypeField.aggregate({
      where: { typeId },
      _max: { sortOrder: true },
    });
    await db.recipeTypeField.create({
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
  }

  revalidatePath(`/admin/types/${typeId}`);
  redirect(`/admin/types/${typeId}`);
}

export async function deleteFieldAction(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") || "");
  const typeId = String(formData.get("typeId") || "");
  await getDb().recipeTypeField.delete({ where: { id } });
  revalidatePath(`/admin/types/${typeId}`);
  redirect(`/admin/types/${typeId}`);
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
    redirect(`/admin/types/${typeId}`);
  }
  const current = fields[index];
  const other = fields[swapWith];
  await db.$transaction([
    db.recipeTypeField.update({ where: { id: current.id }, data: { sortOrder: other.sortOrder } }),
    db.recipeTypeField.update({ where: { id: other.id }, data: { sortOrder: current.sortOrder } }),
  ]);
  revalidatePath(`/admin/types/${typeId}`);
  redirect(`/admin/types/${typeId}`);
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
  revalidatePath("/admin/recipes");
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${slug}`);
  redirect(`/admin/recipes/${recipe.id}?saved=1`);
}

export async function deleteRecipeAction(formData: FormData) {
  await requireEditor();
  await getDb().recipe.delete({ where: { id: String(formData.get("id") || "") } });
  revalidatePath("/admin/recipes");
  revalidatePath("/");
  redirect("/admin/recipes");
}

export async function saveAdminAction(formData: FormData) {
  const actor = await requireAccess("staff");
  const db = getDb();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "editor");
  const photoUrl = String(formData.get("photoUrl") || "").trim();
  if (!name || !email || !isAccessLevel(role)) {
    redirect("/admin/staff?error=missing");
  }
  if (password && password.length < 10) {
    redirect("/admin/staff?error=password");
  }
  if (!id && !password) {
    redirect("/admin/staff?error=password");
  }

  const ownerCount = await db.admin.count({ where: { role: "owner" } });
  if (id) {
    const existing = await db.admin.findUnique({ where: { id } });
    if (!existing) redirect("/admin/staff?error=missing");
    if (existing.role === "owner" && role !== "owner" && ownerCount <= 1) {
      redirect("/admin/staff?error=last-owner");
    }
    await db.admin.update({
      where: { id },
      data: {
        name,
        email,
        role,
        photoUrl,
        ...(password.length >= 10 ? { passwordHash: hashPassword(password) } : {}),
      },
    });
  } else {
    const taken = await db.admin.findUnique({ where: { email } });
    if (taken) redirect("/admin/staff?error=exists");
    await db.admin.create({
      data: { name, email, role, photoUrl, passwordHash: hashPassword(password) },
    });
  }

  await removeMemberByEmail(email);
  revalidatePath("/admin/members");
  revalidatePath("/admin/staff");
  redirect("/admin/staff?saved=1");
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
  revalidatePath("/profile");
  redirect("/admin/members?removed=1");
}

export async function deleteAdminAction(formData: FormData) {
  const actor = await requireAccess("staff");
  const id = String(formData.get("id") || "");
  const db = getDb();
  const existing = await db.admin.findUnique({ where: { id } });
  if (!existing) redirect("/admin/staff");
  if (existing.id === actor.id) redirect("/admin/staff?error=self");
  if (existing.role === "owner") {
    const ownerCount = await db.admin.count({ where: { role: "owner" } });
    if (ownerCount <= 1) redirect("/admin/staff?error=last-owner");
  }
  await db.admin.delete({ where: { id } });
  revalidatePath("/admin/staff");
  redirect("/admin/staff");
}

export async function saveOwnAdminProfileAction(formData: FormData) {
  const actor = await getAdminSession();
  if (!actor) redirect("/admin/login");

  const photoUrl = String(formData.get("photoUrl") || "").trim();
  const db = getDb();

  if (actor.id === "env") {
    const email = actor.email.trim().toLowerCase();
    const existing = await db.admin.findUnique({ where: { email } });
    if (!existing) {
      redirect("/admin/profile?error=named");
    }
    await db.admin.update({ where: { id: existing.id }, data: { photoUrl } });
  } else {
    await db.admin.update({ where: { id: actor.id }, data: { photoUrl } });
  }

  revalidatePath("/admin/profile");
  revalidatePath("/admin/staff");
  redirect("/admin/profile?saved=1");
}
