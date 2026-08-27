"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveOwnAdminProfileAction } from "@/app/admin/actions";
import { adminFocusRing, adminPrimaryButtonClass } from "@/lib/admin-ui";
import {
  ADMIN_IMAGE_ACCEPT,
  ADMIN_IMAGE_HELP,
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
  const fileLabelId = useId();
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
      const raw = await response.text();
      let data: { url?: string; error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { url?: string; error?: string };
        } catch {
          throw new Error("Could not upload photo.");
        }
      }
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
          <span id={fileLabelId} className="sr-only">
            Profile photo image file
          </span>
          <input
            ref={inputRef}
            id={`${name}-file`}
            type="file"
            accept={ADMIN_IMAGE_ACCEPT}
            className="sr-only"
            disabled={busy}
            aria-labelledby={fileLabelId}
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
          Shown on recipe comment replies. Google sign-in sets this by default; {ADMIN_IMAGE_HELP}
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
  const [savedUrl] = useState(defaultPhotoUrl);
  const [previewUrl, setPreviewUrl] = useState(defaultPhotoUrl);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const previewObjectUrl = useRef<string | null>(null);
  const errorId = useId();
  const helpId = useId();
  const fileLabelId = useId();
  const confirmTitleId = useId();

  const previewPending = Boolean(pendingFile);
  const hasPhoto = Boolean(previewUrl);

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
    if (!confirmRemove) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmRemove(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmRemove]);

  function selectFile(file: File) {
    const localCheck = validateAdminImageFile(file);
    if (!localCheck.ok) {
      setError(localCheck.error);
      return;
    }
    setError("");
    clearObjectPreview();
    const localPreview = URL.createObjectURL(file);
    previewObjectUrl.current = localPreview;
    setPreviewUrl(localPreview);
    pendingFileRef.current = file;
    setPendingFile(file);
  }

  function cancelPending() {
    clearObjectPreview();
    pendingFileRef.current = null;
    setPendingFile(null);
    setPreviewUrl(savedUrl);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submitProfilePhoto(formData: FormData) {
    const file = pendingFileRef.current;
    if (!file) return;
    formData.set("photoFile", file);
    await saveOwnAdminProfileAction(formData);
  }

  const altText = previewUrl
    ? actorName
      ? `${actorName} profile photo`
      : "Profile photo"
    : "";

  return (
    <>
      <form
        action={submitProfilePhoto}
        className="border border-line bg-paper px-5 py-4 sm:px-5 sm:py-4"
      >

        <div className="grid gap-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-center sm:gap-5">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-sand">
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
              <ProfileChangeButton
                canPersist={canPersist}
                label={hasPhoto || previewPending ? "Change profile photo" : "Upload profile photo"}
                describedBy={`${helpId}${error ? ` ${errorId}` : ""}`}
                onPick={() => inputRef.current?.click()}
              />
              <span id={fileLabelId} className="sr-only">
                Choose a profile photo image file
              </span>
              <input
                ref={inputRef}
                id="profile-photo-file"
                type="file"
                accept={ADMIN_IMAGE_ACCEPT}
                className="sr-only"
                disabled={!canPersist}
                aria-labelledby={fileLabelId}
                aria-invalid={Boolean(error)}
                aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) selectFile(file);
                }}
              />
              {savedUrl && !previewPending ? (
                <button
                  type="button"
                  disabled={!canPersist}
                  onClick={() => setConfirmRemove(true)}
                  className={`inline-flex min-h-9 items-center text-xs font-semibold text-muted transition-colors duration-150 hover:text-terracotta disabled:opacity-60 ${adminFocusRing}`}
                >
                  Remove photo
                </button>
              ) : null}
            </div>

            {previewPending ? (
              <p id={helpId} className="text-xs leading-5 text-olive-dark" role="status">
                New photo selected
              </p>
            ) : (
              <p id={helpId} className="max-w-md break-words text-xs leading-5 text-muted">
                Shown on recipe comment replies. {ADMIN_IMAGE_HELP}
              </p>
            )}

            <div className="min-h-5" aria-live="polite">
              {error ? (
                <p id={errorId} role="alert" className="text-xs text-terracotta">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {namedAccountHint ? (
          <p className="mt-4 text-sm leading-6 text-muted">
            You are signed in with the owner password. Add yourself as an Owner on the Admins page
            (same email as ADMIN_EMAIL) so your photo can be saved.
          </p>
        ) : null}

        {previewPending ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
            <ProfileSaveButton disabled={!canPersist} />
            <ProfileCancelButton onCancel={cancelPending} />
          </div>
        ) : null}
      </form>

      {confirmRemove ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          role="presentation"
          onClick={() => setConfirmRemove(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            className="w-full max-w-md border border-line bg-paper p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={confirmTitleId} className="font-serif text-2xl text-ink">
              Remove profile photo?
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              Your custom profile photo will be removed. If Google sign-in provides a photo, that may
              show instead.
            </p>
            <form
              action={saveOwnAdminProfileAction}
              className="mt-6 flex flex-wrap items-center gap-3"
            >
              <input type="hidden" name="removePhoto" value="1" />
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className={`rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
              >
                Cancel
              </button>
              <RemoveSubmitButton />
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ProfileChangeButton({
  canPersist,
  label,
  describedBy,
  onPick,
}: {
  canPersist: boolean;
  label: string;
  describedBy: string;
  onPick: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="button"
      disabled={!canPersist || pending}
      className={`inline-flex min-h-9 items-center text-sm font-semibold text-terracotta underline-offset-4 transition-colors duration-150 hover:text-terracotta-dark hover:underline disabled:cursor-not-allowed disabled:opacity-60 ${adminFocusRing}`}
      aria-describedby={describedBy}
      onClick={onPick}
    >
      {label}
    </button>
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

function ProfileCancelButton({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onCancel}
      className={`inline-flex min-h-9 items-center text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta disabled:opacity-60 ${adminFocusRing}`}
    >
      Cancel
    </button>
  );
}

function RemoveSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:opacity-60 ${adminFocusRing}`}
    >
      {pending ? "Removing…" : "Remove photo"}
    </button>
  );
}
