"use client";

import { useEffect, useId, useRef, useState } from "react";
import { refreshSeriesFromYoutubeAction } from "@/app/admin/actions";
import { adminFocusRing, adminIconButtonClass } from "@/lib/admin-ui";

export function SeriesIndexRowOverflow({
  seriesId,
  seriesTitle,
  canRefresh,
  youtubePlaylistUrl,
}: {
  seriesId: string;
  seriesTitle: string;
  canRefresh: boolean;
  youtubePlaylistUrl: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!canRefresh && !youtubePlaylistUrl) return null;

  return (
    <div ref={rootRef} className="relative inline-flex">
      {canRefresh ? (
        <form ref={formRef} action={refreshSeriesFromYoutubeAction}>
          <input type="hidden" name="id" value={seriesId} />
        </form>
      ) : null}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`More actions for ${seriesTitle}`}
        className={`${adminFocusRing} ${adminIconButtonClass}`}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[14rem] border border-line bg-paper py-1 shadow-sm"
        >
          {canRefresh ? (
            <button
              type="button"
              role="menuitem"
              aria-label={`Refresh ${seriesTitle} from YouTube`}
              className={`flex w-full px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-cream hover:text-terracotta sm:py-2 ${adminFocusRing}`}
              onClick={() => {
                setOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Refresh from YouTube
            </button>
          ) : null}
          {youtubePlaylistUrl ? (
            <a
              role="menuitem"
              href={youtubePlaylistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex w-full px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-cream hover:text-terracotta sm:py-2 ${adminFocusRing}`}
              aria-label={`Open ${seriesTitle} playlist on YouTube`}
              onClick={() => setOpen(false)}
            >
              Open playlist on YouTube ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
