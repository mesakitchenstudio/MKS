"use client";

import { useRef } from "react";
import { deleteMemberAction } from "@/app/admin/actions";
import { adminFocusRing } from "@/lib/admin-ui";

export function RemoveMemberButton({
  id,
  name,
  email,
}: {
  id: string;
  name: string;
  email: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={deleteMemberAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="button"
        className={`text-sm font-semibold text-terracotta/90 transition-colors hover:text-terracotta ${adminFocusRing}`}
        onClick={() => {
          if (
            window.confirm(
              `Remove member “${name}” (${email})?\n\nThis permanently deletes their account, saved recipes, and account activity. This cannot be undone.`,
            )
          ) {
            formRef.current?.requestSubmit();
          }
        }}
      >
        Remove member
      </button>
    </form>
  );
}
