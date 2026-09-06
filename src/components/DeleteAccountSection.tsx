"use client";

import { useEffect, useId, useRef, useState } from "react";
import { forcePublicSignOut } from "@/lib/auth-client";
import { authFocusRing, authInputClass } from "@/lib/auth-ui";

function isDeleteConfirmation(value: string) {
  return value.trim() === "DELETE";
}

const DELETE_TRIGGER =
  "inline-flex h-11 items-center justify-center rounded-full border border-line bg-transparent px-5 text-sm font-semibold text-muted transition-colors hover:border-terracotta/50 hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-60";

const CANCEL_BTN =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";

const DESTRUCTIVE_BTN =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const confirmId = useId();
  const errorId = useId();

  function closeDialog() {
    if (busy) return;
    setOpen(false);
    setConfirmText("");
    setError("");
    queueMicrotask(() => triggerRef.current?.focus());
  }

  async function submitDelete() {
    if (!isDeleteConfirmation(confirmText) || busy) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error || "We couldn't delete your account. Please try again.");
        setBusy(false);
        return;
      }
      await forcePublicSignOut();
      // Full navigation after cookie/local session clear so header cannot keep a stale member name.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard reload required post-deletion
      window.location.href = "/?account=deleted";
    } catch {
      setError("We couldn't delete your account. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-7 border-t border-line pt-7 md:mt-8 md:pt-8">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Account</p>
      <h2 className="mt-3 font-serif text-3xl text-ink">Delete your account</h2>
      <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">
        Permanently remove your Mesa account, saved recipes, and member data.
      </p>
      <button
        ref={triggerRef}
        type="button"
        className={`mt-5 ${DELETE_TRIGGER} ${authFocusRing}`}
        onClick={() => {
          setOpen(true);
          setConfirmText("");
          setError("");
        }}
      >
        Delete account
      </button>

      {open ? (
        <DeleteAccountDialog
          titleId={titleId}
          descriptionId={descriptionId}
          confirmId={confirmId}
          errorId={errorId}
          confirmText={confirmText}
          onConfirmTextChange={setConfirmText}
          busy={busy}
          error={error}
          onCancel={closeDialog}
          onDelete={() => void submitDelete()}
        />
      ) : null}
    </section>
  );
}

function DeleteAccountDialog({
  titleId,
  descriptionId,
  confirmId,
  errorId,
  confirmText,
  onConfirmTextChange,
  busy,
  error,
  onCancel,
  onDelete,
}: {
  titleId: string;
  descriptionId: string;
  confirmId: string;
  errorId: string;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmed = isDeleteConfirmation(confirmText);

  useEffect(() => {
    cancelRef.current?.focus();
    const main = document.getElementById("main-content");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (main) main.setAttribute("inert", "");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (busy) return;
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (main) main.removeAttribute("inert");
    };
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-ink/45 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
        className="relative my-0 w-full max-w-[28.125rem] rounded-none border border-line bg-paper p-5 shadow-[0_1px_2px_rgba(42,34,24,0.06)] sm:my-auto sm:rounded-sm sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="font-serif text-[1.875rem] leading-tight text-ink md:text-[2rem]">
          Delete your Mesa account?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
          Your account and saved recipes will be permanently removed, and your newsletter
          subscription will be stopped. Published reviews may remain without a link to your
          account. This action cannot be undone.
        </p>

        <label htmlFor={confirmId} className="mt-5 grid gap-1.5 text-sm font-semibold text-ink">
          Type DELETE to confirm
          <input
            id={confirmId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={confirmText}
            disabled={busy}
            onChange={(event) => onConfirmTextChange(event.target.value)}
            className={authInputClass}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </label>

        {error ? (
          <p id={errorId} role="alert" className="mt-3 text-sm text-terracotta">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            ref={cancelRef}
            type="button"
            className={`${CANCEL_BTN} ${authFocusRing}`}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${DESTRUCTIVE_BTN} ${authFocusRing}`}
            disabled={!confirmed || busy}
            aria-busy={busy}
            onClick={onDelete}
          >
            {busy ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}
