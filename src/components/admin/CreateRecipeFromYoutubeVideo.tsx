"use client";

import { useState } from "react";
import { createRecipeFromYoutubeVideoAction } from "@/app/admin/actions";
import { adminFocusRing, adminPrimaryButtonClass } from "@/lib/admin-ui";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function CreateRecipeFromYoutubeVideo({
  videoId,
  recipeTypes,
  disabled = false,
}: {
  videoId: string;
  recipeTypes: { id: string; name: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState(recipeTypes[0]?.id ?? "");

  if (disabled) {
    return <p className="text-sm text-muted">This video is already linked to a recipe.</p>;
  }

  if (!recipeTypes.length) {
    return <p className="text-sm text-muted">Add a recipe type before creating recipes.</p>;
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
          onClick={() => setOpen(true)}
        >
          Create recipe
        </button>
      ) : (
        <form action={createRecipeFromYoutubeVideoAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="videoId" value={videoId} />
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-ink">Recipe type</span>
            <select
              name="typeId"
              value={typeId}
              onChange={(event) => setTypeId(event.target.value)}
              className="h-10 min-w-[12rem] rounded-sm border border-line bg-paper px-3 text-sm outline-none focus:border-olive focus:ring-2 focus:ring-olive/15"
            >
              {recipeTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Create draft recipe
          </button>
          <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
