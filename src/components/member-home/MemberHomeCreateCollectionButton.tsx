"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { createSavedRecipeCollectionAction } from "@/app/profile/collection-actions";
import { authFocusRing, authInputClass } from "@/lib/auth-ui";

const DIALOG_PRIMARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";
const DIALOG_SECONDARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";

export function MemberHomeCreateCollectionButton({
  label = "Create a collection",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-11 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 ${authFocusRing}`}
      >
        {label}
      </button>
      {open ? (
        <CreateCollectionDialog
          onClose={() => {
            setOpen(false);
            queueMicrotask(() => triggerRef.current?.focus());
          }}
          onCreated={(id) => {
            setOpen(false);
            router.refresh();
            router.push(`/profile/collections/${id}`);
          }}
        />
      ) : null}
    </>
  );
}

function CreateCollectionDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await createSavedRecipeCollectionAction(name);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      inputRef.current?.focus();
      return;
    }
    onCreated(result.data.id);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-sm border border-line bg-paper p-5 shadow-lg"
      >
        <h2 id={titleId} className="font-serif text-2xl text-ink">
          New collection
        </h2>
        <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor={inputId}>
            Name
            <input
              ref={inputRef}
              id={inputId}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={authInputClass}
              autoComplete="off"
            />
          </label>
          {error ? (
            <p id={errorId} className="text-sm text-terracotta" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={DIALOG_SECONDARY} disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={DIALOG_PRIMARY} disabled={busy}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
