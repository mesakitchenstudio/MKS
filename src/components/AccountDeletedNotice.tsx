"use client";

import { useSearchParams } from "next/navigation";

/** Quiet homepage notice after successful self-service account deletion. */
export function AccountDeletedNotice() {
  const params = useSearchParams();
  if (params.get("account") !== "deleted") return null;

  return (
    <p
      role="status"
      className="border-b border-line bg-sand/50 px-4 py-3 text-center text-sm text-ink md:px-6"
    >
      Your Mesa account has been deleted.
    </p>
  );
}
