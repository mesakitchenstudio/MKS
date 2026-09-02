import { NextResponse } from "next/server";
import { storeAdminImage } from "@/lib/admin-upload-store";
import { resolveAdminImageUploadPolicy, validateAdminImageFile } from "@/lib/admin-upload";
import { getAdminSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size <= 0) {
      return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
    }

    const folder = String(form.get("folder") || "recipes");
    const policy = resolveAdminImageUploadPolicy(folder);

    if (file.size > policy.maxBytes) {
      return NextResponse.json({ error: policy.sizeError }, { status: 400 });
    }

    const mimeHint = "type" in file && typeof file.type === "string" ? file.type : "";
    const quick = validateAdminImageFile({ type: mimeHint, size: file.size }, policy);
    if (!quick.ok) {
      return NextResponse.json({ error: quick.error }, { status: 400 });
    }

    const name = file instanceof File && file.name ? file.name : "photo";
    const url = await storeAdminImage(file, folder, name);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Admin upload failed", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Could not upload photo.";
    // Never expose raw stack/storage internals for unknown errors.
    const safe =
      message.startsWith("Choose an image") ||
      message.startsWith("Use a JPEG") ||
      message.startsWith("Image must be") ||
      message.startsWith("Photo storage")
        ? message
        : "Could not upload photo.";
    return NextResponse.json({ error: safe }, { status: 400 });
  }
}
