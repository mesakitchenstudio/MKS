import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAdminAuditEvent } from "@/lib/admin-audit";
import { storeAdminImage } from "@/lib/admin-upload-store";
import { resolveAdminImageUploadPolicy, validateAdminImageFile } from "@/lib/admin-upload";
import { getAdminSession } from "@/lib/auth";
import { mediaAssetDisplayTitle } from "@/lib/media-asset";
import { registerMediaAssetFromUpload } from "@/lib/media-asset-server";
import { canAccess } from "@/lib/admin-access";

export const runtime = "nodejs";

/**
 * Bytes-only storage by default.
 * When registerMedia=1 and folder is recipes|series|media, also creates a MediaAsset
 * (editorial identity). Admin profile photos never enter the Media Library.
 */
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
    const registerMedia = String(form.get("registerMedia") || "") === "1";
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
    const storageFolder = folder === "media" ? "recipes" : folder;
    const url = await storeAdminImage(file, storageFolder, name);

    const shouldRegister =
      registerMedia &&
      canAccess(admin.role, "content") &&
      ["recipes", "series", "media"].includes(folder.trim().toLowerCase());

    if (!shouldRegister) {
      return NextResponse.json({ url });
    }

    const kind =
      folder.trim().toLowerCase() === "series"
        ? "series_hero"
        : folder.trim().toLowerCase() === "media"
          ? "image"
          : "recipe_hero";

    const asset = await registerMediaAssetFromUpload({
      url,
      filenameHint: name,
      byteSize: file.size,
      kind,
      source: "upload",
      createdByAdminId: admin.id !== "env" ? admin.id : null,
      title: String(form.get("title") || "").trim() || undefined,
      altText: String(form.get("altText") || "").trim() || undefined,
    });

    await recordAdminAuditEvent({
      actor: actorFromAdminSession(admin),
      action: "media.created",
      area: "content",
      entityType: "media_asset",
      entityId: asset.id,
      entityLabel: mediaAssetDisplayTitle(asset),
      entityPath: `/admin/media/${asset.id}`,
      metadata: { source: "upload", folder: storageFolder },
    });

    return NextResponse.json({ url, mediaAssetId: asset.id, mediaAsset: asset });
  } catch (error) {
    console.error("Admin upload failed", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Could not upload photo.";
    const safe =
      message.startsWith("Choose an image") ||
      message.startsWith("Use a JPEG") ||
      message.startsWith("Image must be") ||
      message.startsWith("Photo storage") ||
      message.startsWith("Media asset")
        ? message
        : "Could not upload photo.";
    return NextResponse.json({ error: safe }, { status: 400 });
  }
}
