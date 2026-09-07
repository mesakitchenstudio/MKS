"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  adminFocusRing,
  adminPrimaryButtonClass,
} from "@/lib/admin-ui";
import {
  RECIPE_HERO_IMAGE_HELP,
  resolveAdminImageUploadPolicy,
  validateAdminImageFile,
} from "@/lib/admin-upload";

export function MediaLibraryUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(file: File) {
    const policy = resolveAdminImageUploadPolicy("media");
    const localCheck = validateAdminImageFile(file, policy);
    if (!localCheck.ok) {
      setError(localCheck.error);
      return;
    }
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("file", file);
    body.set("folder", "media");
    body.set("registerMedia", "1");
    body.set("title", file.name.replace(/\.[^.]+$/, ""));
    try {
      const response = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await response.json()) as {
        url?: string;
        mediaAssetId?: string;
        error?: string;
      };
      if (!response.ok || !data.mediaAssetId) {
        setError(data.error || "Could not upload and register media.");
        return;
      }
      router.push(`/admin/media/${data.mediaAssetId}?saved=1`);
      router.refresh();
    } catch {
      setError("Could not upload and register media.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted">{RECIPE_HERO_IMAGE_HELP}</p>
      <label className="cursor-pointer justify-self-start">
        <span className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
          {busy ? "Uploading…" : "Upload image"}
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
            event.target.value = "";
          }}
        />
      </label>
      {error ? (
        <p className="text-sm font-semibold text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
