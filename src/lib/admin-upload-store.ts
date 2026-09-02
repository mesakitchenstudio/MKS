import "server-only";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { del, put } from "@vercel/blob";
import {
  adminImageExtension,
  isOwnedAdminUploadUrl,
  resolveAdminImageUploadPolicy,
  validateAdminImageBytes,
} from "@/lib/admin-upload";

function safeFolder(value: string) {
  return value.replace(/[^\w-]+/g, "") || "recipes";
}

function safeBaseName(name: string) {
  return name.replace(/[^\w.-]+/g, "-").replace(/\.[^.]+$/, "") || "photo";
}

/** Validate magic bytes, store, return public URL. */
export async function storeAdminImage(file: Blob, folder = "recipes", filenameHint = "photo") {
  const policy = resolveAdminImageUploadPolicy(folder);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateAdminImageBytes(bytes, policy);
  if (!check.ok) {
    throw new Error(check.error);
  }

  const ext = adminImageExtension(check.mime);
  const filename = `${Date.now()}-${safeBaseName(filenameHint)}.${ext}`;
  const destFolder = safeFolder(folder);
  const buffer = Buffer.from(bytes);

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`${destFolder}/${filename}`, buffer, {
      access: "public",
      contentType: check.mime,
    });
    return blob.url;
  }

  if (process.env.VERCEL) {
    throw new Error("Photo storage is not configured.");
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/${filename}`;
}

/** Delete an app-owned upload only. Never touches Google avatars or foreign URLs. */
export async function deleteOwnedAdminImage(url: string) {
  const value = url.trim();
  if (!isOwnedAdminUploadUrl(value)) return;

  try {
    if (value.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), "public", value.replace(/^\//, ""));
      const uploadsRoot = path.join(process.cwd(), "public", "uploads");
      if (!filePath.startsWith(uploadsRoot)) return;
      await unlink(filePath).catch(() => undefined);
      return;
    }

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      await del(value);
    }
  } catch (error) {
    console.error("Could not delete owned admin image", error);
  }
}
