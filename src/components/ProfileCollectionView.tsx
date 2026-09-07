"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";
import type { Recipe } from "@/data/types";
import {
  addSavedRecipeToCollectionAction,
  removeSavedRecipeFromCollectionAction,
  renameSavedRecipeCollectionAction,
  deleteSavedRecipeCollectionAction,
} from "@/app/profile/collection-actions";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { authFocusRing, authInputClass } from "@/lib/auth-ui";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { collectionRecipeCountLabel } from "@/lib/saved-recipe-collections";

type Membership = { itemId: string; recipeSaveId: string; slug: string };

export function ProfileCollectionView({
  collectionId,
  collectionName,
  recipes,
  memberships,
  addableSaves,
}: {
  collectionId: string;
  collectionName: string;
  recipes: Recipe[];
  memberships: Membership[];
  /** Saved recipes not yet in this collection (published only). */
  addableSaves: { recipeSaveId: string; slug: string; title: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(collectionName);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [addSaveId, setAddSaveId] = useState("");
  const [error, setError] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const addId = useId();
  const renameId = useId();

  const saveIdBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of memberships) map.set(row.slug, row.recipeSaveId);
    return map;
  }, [memberships]);

  async function removeFromCollection(slug: string) {
    const recipeSaveId = saveIdBySlug.get(slug);
    if (!recipeSaveId) return;
    setBusySlug(slug);
    setError("");
    const result = await removeSavedRecipeFromCollectionAction({
      collectionId,
      recipeSaveId,
    });
    setBusySlug(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  async function addToCollection(event: FormEvent) {
    event.preventDefault();
    if (!addSaveId) return;
    setError("");
    const result = await addSavedRecipeToCollectionAction({
      collectionId,
      recipeSaveId: addSaveId,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAddSaveId("");
    router.refresh();
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault();
    setError("");
    const result = await renameSavedRecipeCollectionAction(collectionId, name);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRenameOpen(false);
    router.refresh();
  }

  async function confirmDelete() {
    setError("");
    const result = await deleteSavedRecipeCollectionAction(collectionId);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push("/profile");
    router.refresh();
  }

  return (
    <div>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        <Link href="/profile" className={`rounded-sm hover:text-terracotta ${authFocusRing}`}>
          Saved recipes
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words font-serif text-4xl text-ink md:text-5xl">{collectionName}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {collectionRecipeCountLabel(recipes.length)} · private collection
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold ${authFocusRing}`}
            onClick={() => setRenameOpen((open) => !open)}
          >
            Rename
          </button>
          <button
            type="button"
            className={`inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-muted hover:text-terracotta ${authFocusRing}`}
            onClick={() => setDeleteOpen((open) => !open)}
          >
            Delete
          </button>
        </div>
      </div>

      {renameOpen ? (
        <form className="mt-4 max-w-md space-y-3" onSubmit={(event) => void submitRename(event)}>
          <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor={renameId}>
            Collection name
            <input
              id={renameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={authInputClass}
              maxLength={80}
              required
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`h-11 rounded-full border border-line px-4 text-sm font-semibold ${authFocusRing}`}
              onClick={() => {
                setRenameOpen(false);
                setName(collectionName);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`h-11 rounded-full bg-terracotta px-4 text-sm font-semibold text-paper ${authFocusRing}`}
            >
              Save name
            </button>
          </div>
        </form>
      ) : null}

      {deleteOpen ? (
        <div className="mt-4 max-w-lg rounded-sm border border-line bg-sand/40 p-4" role="group" aria-label="Confirm delete collection">
          <p className="text-sm leading-6 text-muted">
            Deleting this collection will not remove the recipes from Saved Recipes. Only this
            collection organization is removed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`h-11 rounded-full border border-line px-4 text-sm font-semibold ${authFocusRing}`}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`h-11 rounded-full bg-terracotta px-4 text-sm font-semibold text-paper ${authFocusRing}`}
              onClick={() => void confirmDelete()}
            >
              Delete collection
            </button>
          </div>
        </div>
      ) : null}

      {addableSaves.length ? (
        <form className="mt-6 flex max-w-xl flex-wrap items-end gap-2" onSubmit={(event) => void addToCollection(event)}>
          <label className="min-w-[12rem] flex-1 grid gap-2 text-sm font-semibold text-ink" htmlFor={addId}>
            Add a saved recipe
            <select
              id={addId}
              value={addSaveId}
              onChange={(event) => setAddSaveId(event.target.value)}
              className={authInputClass}
            >
              <option value="">Choose a recipe…</option>
              {addableSaves.map((save) => (
                <option key={save.recipeSaveId} value={save.recipeSaveId}>
                  {save.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!addSaveId}
            className={`h-11 rounded-full bg-terracotta px-4 text-sm font-semibold text-paper disabled:opacity-60 ${authFocusRing}`}
          >
            Add
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}

      {recipes.length === 0 ? (
        <div className="mt-8 max-w-md">
          <p className="text-sm font-semibold text-ink">No recipes in this collection yet.</p>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            Add recipes from your saved list above, or return to{" "}
            <Link href="/profile" className={`font-semibold text-terracotta ${authFocusRing}`}>
              All Saved
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => {
            const dishLabel = resolveRecipeCardTitle(recipe);
            return (
              <RecipeGridCard
                key={recipe.slug}
                recipe={recipe}
                compact
                mediaOverlay={
                  <button
                    type="button"
                    disabled={busySlug === recipe.slug}
                    aria-label={`Remove ${dishLabel} from ${collectionName}`}
                    onClick={() => void removeFromCollection(recipe.slug)}
                    className={`flex h-11 items-center justify-center rounded-full bg-paper/95 px-3 text-xs font-semibold text-ink shadow-sm hover:bg-terracotta hover:text-paper disabled:opacity-60 ${authFocusRing}`}
                  >
                    Remove
                  </button>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
