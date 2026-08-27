"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  children,
  pendingLabel = "Saving…",
  className,
  formAction,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      formAction={formAction}
      aria-busy={pending}
      className={`${className || ""} ${pending ? "cursor-wait opacity-70" : ""}`.trim()}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
