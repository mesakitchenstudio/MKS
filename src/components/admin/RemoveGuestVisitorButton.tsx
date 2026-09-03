"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteGuestVisitorAction } from "@/app/admin/actions";
import { adminFocusRing } from "@/lib/admin-ui";

const confirmMessage =
  "Delete this visitor and all recorded page views? This action cannot be undone.";

export function RemoveGuestVisitorButton({
  id,
  disabled = false,
  redirectTo,
}: {
  id: string;
  disabled?: boolean;
  /** After success, navigate here (e.g. overview). Default: refresh current route. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const isDisabled = disabled || pending;

  function handleClick() {
    if (isDisabled) return;
    if (!window.confirm(confirmMessage)) return;

    setError("");
    startTransition(async () => {
      const result = await deleteGuestVisitorAction(id);
      if (!result.ok) {
        if (result.error === "not-found") {
          setError("Visitor not found.");
        } else if (result.error === "missing") {
          setError("Missing visitor id.");
        } else {
          setError("Could not delete visitor. Try again.");
        }
        return;
      }
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={isDisabled}
        aria-busy={pending}
        className={`text-sm font-semibold text-terracotta/90 transition-colors hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-60 ${adminFocusRing}`}
        onClick={handleClick}
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? (
        <span className="max-w-[8rem] text-right text-[0.65rem] leading-snug text-terracotta">
          {error}
        </span>
      ) : null}
    </span>
  );
}
