"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/** Quiet homepage notice after successful self-service account deletion. */
export function AccountDeletedNotice() {
  const params = useSearchParams();
  const fromUrl = params.get("account") === "deleted";
  // Keep the notice for this visit after the query param is stripped from the URL.
  const [sticky, setSticky] = useState(false);
  if (fromUrl && !sticky) {
    setSticky(true);
  }
  const visible = fromUrl || sticky;

  useEffect(() => {
    if (!fromUrl || typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("account") !== "deleted") return;
    url.searchParams.delete("account");
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;
    window.history.replaceState(window.history.state, "", next);
  }, [fromUrl]);

  if (!visible) return null;

  return (
    <p
      role="status"
      className="border-b border-line bg-sand/50 px-4 py-3 text-center text-sm text-ink md:px-6"
    >
      Your Mesa account has been deleted.
    </p>
  );
}
