"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorFromAdminSession, recordAdminAuditEvent } from "@/lib/admin-audit";
import { requireAccess } from "@/lib/auth";
import { mediaAssetDisplayTitle } from "@/lib/media-asset";
import {
  deleteMediaAsset,
  getMediaAssetById,
  registerExternalMediaAsset,
  setMediaAssetActive,
  updateMediaAsset,
} from "@/lib/media-asset-server";

function mediaPath(id?: string) {
  return id ? `/admin/media/${id}` : "/admin/media";
}

function createdByAdminId(admin: { id: string }) {
  return admin.id && admin.id !== "env" ? admin.id : null;
}

export async function saveMediaAssetAction(formData: FormData) {
  const admin = await requireAccess("content");
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/media?error=missing");

  const existing = await getMediaAssetById(id);
  if (!existing) redirect("/admin/media?error=missing");

  const updated = await updateMediaAsset(id, {
    title: String(formData.get("title") || ""),
    altText: String(formData.get("altText") || ""),
    credit: String(formData.get("credit") || ""),
    notes: String(formData.get("notes") || ""),
    kind: String(formData.get("kind") || existing.kind),
  });

  await recordAdminAuditEvent({
    actor: actorFromAdminSession(admin),
    action: "media.updated",
    area: "content",
    entityType: "media_asset",
    entityId: updated.id,
    entityLabel: mediaAssetDisplayTitle(updated),
    entityPath: mediaPath(updated.id),
    metadata: { fields: ["title", "altText", "credit", "notes", "kind"] },
  });

  revalidatePath("/admin/media");
  revalidatePath(mediaPath(id));
  redirect(`${mediaPath(id)}?saved=1`);
}

export async function setMediaAssetActiveAction(formData: FormData) {
  const admin = await requireAccess("content");
  const id = String(formData.get("id") || "").trim();
  const isActive = String(formData.get("isActive") || "") === "1";
  if (!id) redirect("/admin/media?error=missing");

  const updated = await setMediaAssetActive(id, isActive);
  await recordAdminAuditEvent({
    actor: actorFromAdminSession(admin),
    action: isActive ? "media.activated" : "media.deactivated",
    area: "content",
    entityType: "media_asset",
    entityId: updated.id,
    entityLabel: mediaAssetDisplayTitle(updated),
    entityPath: mediaPath(updated.id),
  });

  revalidatePath("/admin/media");
  revalidatePath(mediaPath(id));
  redirect(mediaPath(id));
}

export async function deleteMediaAssetAction(formData: FormData) {
  const admin = await requireAccess("content");
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/media?error=missing");

  const existing = await getMediaAssetById(id);
  if (!existing) redirect("/admin/media?error=missing");

  const result = await deleteMediaAsset(id, { deleteOwnedBytesIfUnused: true });
  if (!result.deleted) {
    redirect(`${mediaPath(id)}?error=in_use`);
  }

  await recordAdminAuditEvent({
    actor: actorFromAdminSession(admin),
    action: "media.deleted",
    area: "content",
    entityType: "media_asset",
    entityId: id,
    entityLabel: mediaAssetDisplayTitle(existing),
    entityPath: "/admin/media",
    metadata: { bytesDeleted: result.bytesDeleted },
  });

  revalidatePath("/admin/media");
  redirect("/admin/media?deleted=1");
}

export async function registerExternalMediaAssetAction(formData: FormData) {
  const admin = await requireAccess("content");
  const url = String(formData.get("url") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const altText = String(formData.get("altText") || "").trim();
  const credit = String(formData.get("credit") || "").trim();
  const kind = String(formData.get("kind") || "image").trim() || "image";

  try {
    const asset = await registerExternalMediaAsset({
      url,
      title,
      altText,
      credit,
      kind,
      createdByAdminId: createdByAdminId(admin),
    });

    await recordAdminAuditEvent({
      actor: actorFromAdminSession(admin),
      action: "media.registered",
      area: "content",
      entityType: "media_asset",
      entityId: asset.id,
      entityLabel: mediaAssetDisplayTitle(asset),
      entityPath: mediaPath(asset.id),
      metadata: { source: "external_url" },
    });

    revalidatePath("/admin/media");
    redirect(`${mediaPath(asset.id)}?saved=1`);
  } catch {
    redirect(`/admin/media?error=url`);
  }
}
