"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveOwnAdminProfileAction } from "@/app/admin/actions";
import { adminFocusRing, adminPrimaryButtonClass } from "@/lib/admin-ui";
import {
  ADMIN_IMAGE_MAX_BYTES,
  validateAdminImageFile,
} from "@/lib/admin-upload";

type Presentation = "compact" | "profile";

export function AdminPhotoField({
  name = "photoUrl",
  defaultValue = "",
  presentation = "compact",
  actorName = "",
  onDirtyChange,
  onBusyChange,
}: {
  name?: string;
  defaultValue?: string;
  presentation?: Presentation;
  actorName?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [savedUrl] = useState(defaultValue);
  const [url, setUrl] = useState(defaultValue);
  const [previewUrl, setPreviewUrl] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrl = useRef<string | null>(null);
  const errorId = useId();
  const helpId = useId();
  const isProfile = presentation === "profile";

  function clearObjectPreview() {
    if (previewObjectUrl.current) {
      URL.revokeObjectURL(previewObjectUrl.current);
      previewObjectUrl.current = null;
    }
  }

  useEffect(() => {
    return () => clearObjectPreview();
  }, []);

  useEffect(() => {
    onDirtyChange?.(url !== savedUrl);
  }, [url, savedUrl, onDirtyChange]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  async function onFile(file: File) {
    setBusy(true);
    setError("");

    const localCheck = validateAdminImageFile(file);
    if (!localCheck.ok) {
      setError(localCheck.error);
      setBusy(false);
      return;
    }

    clearObjectPreview();
    const localPreview = URL.createObjectURL(file);
    previewObjectUrl.current = localPreview;
    setPreviewUrl(localPreview);

    const body = new FormData();
    body.set("file", file);
    body.set("folder", "admins");
    try {
      const response = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Could not upload photo.");
      }
      clearObjectPreview();
      setUrl(data.url);
      setPreviewUrl(data.url);
    } catch (err) {
      clearObjectPreview();
      setPreviewUrl(url);
      setError(err instanceof Error ? err.message : "Could not upload photo.");
    } finally {
      setBusy(false);
    }
  }

  function removePhoto() {
    clearObjectPreview();
    setUrl("");
    setPreviewUrl("");
    setError("");
  }

  const avatarSize = isProfile ? "h-24 w-24" : "h-20 w-20";
  const altText = previewUrl
    ? actorName
      ? `${actorName} profile photo`
      : "Profile photo"
    : "";

  return (
    <div
      className={
        isProfile
          ? "grid gap-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-center sm:gap-5"
          : "grid gap-3 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-center"
      }
    >
      <input type="hidden" name={name} value={url} />
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-sand ${avatarSize}`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={altText} className="h-full w-full object-cover" />
        ) : (
          <span className="px-2 text-center text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            No photo
          </span>
        )}
      </div>

      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            disabled={busy}
            className={`inline-flex min-h-9 items-center text-sm font-semibold text-terracotta underline-offset-4 transition-colors duration-150 hover:text-terracotta-dark hover:underline disabled:cursor-wait disabled:opacity-70 ${adminFocusRing}`}
            aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading…" : previewUrl ? "Change profile photo" : "Upload profile photo"}
          </button>
          <input
            ref={inputRef}
            id={`${name}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            disabled={busy}
            aria-invalid={Boolean(error)}
            aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onFile(file);
            }}
          />
          {previewUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={removePhoto}
              className={`inline-flex min-h-9 items-center text-xs font-semibold text-muted transition-colors duration-150 hover:text-terracotta disabled:opacity-70 ${adminFocusRing}`}
            >
              Remove photo
            </button>
          ) : null}
        </div>

        <p id={helpId} className="max-w-md text-xs leading-5 text-muted">
          {isProfile
            ? `Shown on recipe comment replies. Square images work best. JPEG, PNG, WebP, or GIF · max ${Math.round(ADMIN_IMAGE_MAX_BYTES / (1024 * 1024))} MB.`
            : `Shown on recipe comment replies. Google sign-in sets this by default; square photos work best. JPEG, PNG, WebP, or GIF up to ${Math.round(ADMIN_IMAGE_MAX_BYTES / (1024 * 1024))} MB.`}
        </p>

        <div className="min-h-5" aria-live="polite">
          {error ? (
            <p id={errorId} role="alert" className="text-xs text-terracotta">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AdminProfilePhotoForm({
  defaultPhotoUrl,
  actorName,
  canPersist,
  namedAccountHint = false,
}: {
  defaultPhotoUrl: string;
  actorName: string;
  canPersist: boolean;
  namedAccountHint?: boolean;
}) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={saveOwnAdminProfileAction}
      className="border border-line bg-paper px-5 py-4 sm:px-5 sm:py-4"
    >
      <AdminPhotoField
        defaultValue={defaultPhotoUrl}
        presentation="profile"
        actorName={actorName}
        onDirtyChange={setDirty}
        onBusyChange={setBusy}
      />

      {namedAccountHint ? (
        <p className="mt-4 text-sm leading-6 text-muted">
          You are signed in with the owner password. Add yourself as an Owner on the Admins page
          (same email as ADMIN_EMAIL) so your photo can be saved.
        </p>
      ) : null}

      <div className="mt-4 border-t border-line pt-4">
        <ProfileSaveButton disabled={!canPersist || !dirty || busy} />
      </div>
    </form>
  );
}

function ProfileSaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={pending}
      className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
    >
      {pending ? "Saving…" : "Save photo"}
    </button>
  );
}
