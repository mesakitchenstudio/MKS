"use client";

import { useRef } from "react";
import { deleteTypeAction } from "@/app/admin/actions";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";

export function DeleteTypeButton({
  id,
  name,
  recipeCount,
}: {
  id: string;
  name: string;
  recipeCount: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (recipeCount > 0) {
    return null;
  }

  return (
    <form ref={formRef} action={deleteTypeAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="button"
        className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
        onClick={() => {
          if (window.confirm(`Delete “${name}”? This cannot be undone.`)) {
            formRef.current?.requestSubmit();
          }
        }}
      >
        Delete
      </button>
    </form>
  );
}
