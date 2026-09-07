"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  createSavedRecipeCollectionAction,
  deleteSavedRecipeCollectionAction,
  renameSavedRecipeCollectionAction,
} from "@/app/profile/collection-actions";
import { authFocusRing, authInputClass } from "@/lib/auth-ui";
import {
  type MemberCollectionSummary,
} from "@/lib/saved-recipe-collections";

const DIALOG_PRIMARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";
const DIALOG_SECONDARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";

export function ProfileSavedCollections({
  collections,
  allSavedCount,
}: {
  collections: MemberCollectionSummary[];
  allSavedCount: number;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<MemberCollectionSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemberCollectionSummary | null>(null);
  const createTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl text-ink">Collections</h3>
          <p className="mt-1 text-sm text-muted">
            Optional folders for your saved recipes. Private to your account.
          </p>
        </div>
        <button
          ref={createTriggerRef}
          type="button"
          onClick={() => setCreateOpen(true)}
          className={`inline-flex h-11 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 ${authFocusRing}`}
        >
          New collection
        </button>
      </div>

      <nav aria-label="Saved recipe library" className="mt-5 space-y-1">
        <Link
          href="/profile"
          className={`flex items-baseline justify-between gap-3 rounded-sm px-2 py-2.5 text-sm font-semibold text-ink hover:bg-sand/60 ${authFocusRing}`}
          aria-current="page"
        >
          <span>All Saved</span>
          <span className="font-normal text-muted">{allSavedCount}</span>
        </Link>
        {collections.map((collection) => (
          <div
            key={collection.id}
            className="flex items-center gap-1 rounded-sm hover:bg-sand/60"
          >
            <Link
              href={`/profile/collections/${collection.id}`}
              className={`min-w-0 flex-1 px-2 py-2.5 text-sm font-semibold text-ink ${authFocusRing} rounded-sm`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate">{collection.name}</span>
                <span className="shrink-0 font-normal text-muted">
                  {collection.visibleCount}
                </span>
              </span>
            </Link>
            <button
              type="button"
              className={`shrink-0 rounded-sm px-2 py-2 text-xs font-semibold text-muted hover:text-ink ${authFocusRing}`}
              aria-label={`Rename ${collection.name}`}
              onClick={() => setRenameTarget(collection)}
            >
              Rename
            </button>
            <button
              type="button"
              className={`shrink-0 rounded-sm px-2 py-2 text-xs font-semibold text-muted hover:text-terracotta ${authFocusRing}`}
              aria-label={`Delete ${collection.name}`}
              onClick={() => setDeleteTarget(collection)}
            >
              Delete
            </button>
          </div>
        ))}
      </nav>

      {collections.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Create a collection to organize your saved recipes.
        </p>
      ) : null}

      {createOpen ? (
        <CollectionNameDialog
          title="New collection"
          confirmLabel="Create"
          initialName=""
          onClose={() => {
            setCreateOpen(false);
            queueMicrotask(() => createTriggerRef.current?.focus());
          }}
          onSubmit={async (name) => {
            const result = await createSavedRecipeCollectionAction(name);
            if (!result.ok) return result.message;
            router.refresh();
            router.push(`/profile/collections/${result.data.id}`);
            return null;
          }}
        />
      ) : null}

      {renameTarget ? (
        <CollectionNameDialog
          title="Rename collection"
          confirmLabel="Save"
          initialName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onSubmit={async (name) => {
            const result = await renameSavedRecipeCollectionAction(renameTarget.id, name);
            if (!result.ok) return result.message;
            router.refresh();
            return null;
          }}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteCollectionDialog
          collectionName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const result = await deleteSavedRecipeCollectionAction(deleteTarget.id);
            if (!result.ok) return result.message;
            router.refresh();
            return null;
          }}
        />
      ) : null}
    </div>
  );
}

function CollectionNameDialog({
  title,
  confirmLabel,
  initialName,
  onClose,
  onSubmit,
}: {
  title: string;
  confirmLabel: string;
  initialName: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
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
    const message = await onSubmit(name);
    setBusy(false);
    if (message) {
      setError(message);
      inputRef.current?.focus();
      return;
    }
    onClose();
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
          {title}
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
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function DeleteCollectionDialog({
  collectionName,
  onClose,
  onConfirm,
}: {
  collectionName: string;
  onClose: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function confirm() {
    setBusy(true);
    setError("");
    const message = await onConfirm();
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    onClose();
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
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-sm border border-line bg-paper p-5 shadow-lg"
      >
        <h2 id={titleId} className="font-serif text-2xl text-ink">
          Delete {collectionName}?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
          Deleting this collection will not remove the recipes from Saved Recipes. Only the
          collection organization is removed.
        </p>
        {error ? (
          <p id={errorId} className="mt-3 text-sm text-terracotta" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            ref={cancelRef}
            type="button"
            className={DIALOG_SECONDARY}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="button" className={DIALOG_PRIMARY} disabled={busy} onClick={() => void confirm()}>
            Delete collection
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
