"use client";

import { useEffect, useId, useRef, useState } from "react";
import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function ShareButtons({ title, slug }: { title: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const url = `${site.url}/recipes/${slug}`;
  const encoded = encodeURIComponent(url);
  const text = encodeURIComponent(title);
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

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

  async function copy() {
    await navigator.clipboard.writeText(url);
    trackEvent("recipe_copy_link", {
      recipe_slug: slug,
      recipe_title: title,
    });
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
      trackEvent("recipe_share", {
        recipe_slug: slug,
        recipe_title: title,
        platform: "native",
      });
      setOpen(false);
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div ref={rootRef} className="no-print relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={`text-sm font-semibold text-ink/70 hover:text-terracotta ${focusRing}`}
      >
        Share
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Share recipe"
          className="absolute right-0 z-20 mt-2 min-w-[11rem] border border-line bg-paper py-1 shadow-[0_8px_24px_rgba(42,34,24,0.12)]"
        >
          <button
            type="button"
            role="menuitem"
            className={`block w-full px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-cream/70 ${focusRing}`}
            onClick={() => void copy()}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            role="menuitem"
            href={`https://www.pinterest.com/pin/create/button/?url=${encoded}&description=${text}`}
            className={`block px-3 py-2 text-sm font-semibold text-ink hover:bg-cream/70 ${focusRing}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEvent("recipe_share", {
                recipe_slug: slug,
                recipe_title: title,
                platform: "pinterest",
              })
            }
          >
            Pinterest
          </a>
          <a
            role="menuitem"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encoded}`}
            className={`block px-3 py-2 text-sm font-semibold text-ink hover:bg-cream/70 ${focusRing}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEvent("recipe_share", {
                recipe_slug: slug,
                recipe_title: title,
                platform: "facebook",
              })
            }
          >
            Facebook
          </a>
          {canNativeShare ? (
            <button
              type="button"
              role="menuitem"
              className={`block w-full px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-cream/70 ${focusRing}`}
              onClick={() => void nativeShare()}
            >
              More…
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
