import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import {
  adminImageExtension,
  isAdminImageMime,
  validateAdminImageFile,
} from "@/lib/admin-upload";
import { getAdminSession } from "@/lib/auth";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const check = validateAdminImageFile(file);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  if (!isAdminImageMime(file.type)) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  }

  const ext = adminImageExtension(file.type);
  const base = file.name.replace(/[^\w.-]+/g, "-").replace(/\.[^.]+$/, "") || "photo";
  const filename = `${Date.now()}-${base}.${ext}`;
  const folder = String(form.get("folder") || "recipes").replace(/[^\w-]+/g, "") || "recipes";

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`${folder}/${filename}`, file, {
      access: "public",
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url });
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `/uploads/${filename}` });
}
