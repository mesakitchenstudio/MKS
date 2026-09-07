"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  createCollectionAndAddRecipeAction,
  getRecipeCollectionPickerStateAction,
  setSavedRecipeCollectionMembershipsAction,
} from "@/app/profile/collection-actions";
import { authFocusRing, authInputClass } from "@/lib/auth-ui";
import { MemberSessionExpiredError } from "@/lib/auth-client";
import type { RecipeCollectionPickerState } from "@/lib/saved-recipe-collections";

const DIALOG_PRIMARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";
const DIALOG_SECONDARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none";

export type OrganizeRecipeRef = {
  recipeId?: string;
  recipeSlug: string;
  recipeTitle: string;
};

export function SavedRecipeCollectionPicker({
  recipe,
  onClose,
  onUnauthorized,
  onSaved,
}: {
  recipe: OrganizeRecipeRef;
  onClose: () => void;
  onUnauthorized?: () => void;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<RecipeCollectionPickerState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const createId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getRecipeCollectionPickerStateAction({
      recipeId: recipe.recipeId,
      recipeSlug: recipe.recipeSlug,
    }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        if (result.error === "UNAUTHORIZED") {
          onUnauthorized?.();
          onClose();
          return;
        }
        setError(result.message);
        return;
      }
      setState(result.data);
      setSelected(new Set(result.data.collections.filter((c) => c.selected).map((c) => c.id)));
      queueMicrotask(() => closeRef.current?.focus());
    });
    return () => {
      cancelled = true;
    };
  }, [recipe.recipeId, recipe.recipeSlug, onClose, onUnauthorized]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitDone() {
    setBusy(true);
    setError("");
    try {
      const result = await setSavedRecipeCollectionMembershipsAction({
        recipeId: recipe.recipeId,
        recipeSlug: recipe.recipeSlug,
        collectionIds: [...selected],
      });
      if (!result.ok) {
        if (result.error === "UNAUTHORIZED") {
          onUnauthorized?.();
          onClose();
          return;
        }
        setError(result.message);
        setBusy(false);
        return;
      }
      onSaved?.();
      onClose();
    } catch (error) {
      setBusy(false);
      if (error instanceof MemberSessionExpiredError) {
        onUnauthorized?.();
        onClose();
        return;
      }
      setError("Could not update collections. Try again.");
    }
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await createCollectionAndAddRecipeAction({
      recipeId: recipe.recipeId,
      recipeSlug: recipe.recipeSlug,
      name: newName,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.error === "UNAUTHORIZED") {
        onUnauthorized?.();
        onClose();
        return;
      }
      setError(result.message);
      createInputRef.current?.focus();
      return;
    }
    setState((current) => {
      const collections = [
        { id: result.data.id, name: result.data.name, selected: true },
        ...(current?.collections ?? []).filter((row) => row.id !== result.data.id),
      ];
      return {
        recipeSaveId: current?.recipeSaveId ?? "",
        membershipCount: result.data.selectedIds.length,
        collections,
      };
    });
    setSelected(new Set(result.data.selectedIds));
    setCreating(false);
    setNewName("");
    onSaved?.();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
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
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-sm border border-line bg-paper shadow-lg sm:rounded-sm"
      >
        <div className="border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-serif text-2xl text-ink">
            Save to collections
          </h2>
          <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-muted">
            This recipe is already in Saved recipes. Choose any collections you want to
            organize it into.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted" aria-live="polite">
              Loading collections…
            </p>
          ) : null}

          {!loading && state && state.collections.length === 0 && !creating ? (
            <div>
              <p className="text-sm text-muted">You haven&apos;t created any collections yet.</p>
              <button
                type="button"
                className={`mt-3 text-sm font-semibold text-terracotta ${authFocusRing} rounded-sm`}
                onClick={() => setCreating(true)}
              >
                + Create collection
              </button>
            </div>
          ) : null}

          {!loading && state && state.collections.length > 0 ? (
            <ul ref={listRef} className="space-y-1" aria-label="Your collections">
              {state.collections.map((collection) => {
                const checkboxId = `collection-${collection.id}`;
                return (
                  <li key={collection.id}>
                    <label
                      htmlFor={checkboxId}
                      className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2.5 hover:bg-sand/60"
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={selected.has(collection.id)}
                        onChange={() => toggle(collection.id)}
                        disabled={busy}
                        className="h-4 w-4 accent-terracotta"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                        {collection.name}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {!loading && !creating && state && state.collections.length > 0 ? (
            <button
              type="button"
              className={`mt-3 text-sm font-semibold text-terracotta ${authFocusRing} rounded-sm`}
              onClick={() => setCreating(true)}
              disabled={busy}
            >
              + New collection
            </button>
          ) : null}

          {creating ? (
            <form className="mt-4 space-y-3" onSubmit={(event) => void submitCreate(event)}>
              <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor={createId}>
                New collection name
                <input
                  ref={createInputRef}
                  id={createId}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  maxLength={80}
                  required
                  disabled={busy}
                  className={authInputClass}
                  autoComplete="off"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={DIALOG_SECONDARY}
                  disabled={busy}
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className={DIALOG_PRIMARY} disabled={busy}>
                  Create
                </button>
              </div>
            </form>
          ) : null}

          {error ? (
            <p id={errorId} className="mt-3 text-sm text-terracotta" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
          <button
            ref={closeRef}
            type="button"
            className={DIALOG_SECONDARY}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={DIALOG_PRIMARY}
            disabled={busy || loading || !state}
            onClick={() => void submitDone()}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function UnsaveWithCollectionsConfirm({
  membershipCount,
  onCancel,
  onConfirm,
  busy = false,
}: {
  membershipCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  if (typeof document === "undefined") return null;

  const countLabel =
    membershipCount === 1 ? "1 collection" : `${membershipCount} collections`;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
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
          Remove from Saved recipes?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
          This recipe is also in {countLabel}. Removing it from Saved recipes will remove it
          from those collections too.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            ref={cancelRef}
            type="button"
            className={DIALOG_SECONDARY}
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="button" className={DIALOG_PRIMARY} disabled={busy} onClick={onConfirm}>
            Remove
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
