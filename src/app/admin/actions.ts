"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, createSessionToken, isAdmin, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { emptyValue, keyFromLabel, slugify } from "@/lib/fields";

async function requireAdmin() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }
}

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") || "");
  if (!verifyPassword(password)) {
    redirect("/admin/login?error=1");
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/admin");
}

export async function logoutAction() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

export async function saveCategoryAction(formData: FormData) {
  await requireAdmin();
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
  await requireAdmin();
  await getDb().category.delete({ where: { id: String(formData.get("id") || "") } });
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

export async function saveTypeAction(formData: FormData) {
  await requireAdmin();
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

  const created = await db.recipeType.create({ data: { name, slug, description } });
  revalidatePath("/admin/types");
  redirect(`/admin/types/${created.id}`);
}

export async function deleteTypeAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const used = await getDb().recipe.count({ where: { typeId: id } });
  if (used > 0) redirect("/admin/types?error=inuse");
  await getDb().recipeType.delete({ where: { id } });
  revalidatePath("/admin/types");
  redirect("/admin/types");
}

export async function saveFieldAction(formData: FormData) {
  await requireAdmin();
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
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const typeId = String(formData.get("typeId") || "");
  await getDb().recipeTypeField.delete({ where: { id } });
  revalidatePath(`/admin/types/${typeId}`);
  redirect(`/admin/types/${typeId}`);
}

export async function moveFieldAction(formData: FormData) {
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
  await getDb().recipe.delete({ where: { id: String(formData.get("id") || "") } });
  revalidatePath("/admin/recipes");
  revalidatePath("/");
  redirect("/admin/recipes");
}
