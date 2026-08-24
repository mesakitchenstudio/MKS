"use client";

import { useEffect, useState } from "react";
import { youtubeEmbedUrl } from "@/lib/youtube";

const SHOW_AFTER_PX = 48;
const HIDE_BEFORE_PX = 120;

export function RecipeFloatingVideo({ url, title }: { url: string; title: string }) {
  const embed = youtubeEmbedUrl(url, { autoplay: true });
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!embed) return;

    function updateVisibility() {
      const target = document.getElementById("studio-video");
      if (target) {
        const bottom = target.getBoundingClientRect().bottom;
        setVisible((wasVisible) => {
          if (wasVisible) return bottom < HIDE_BEFORE_PX;
          return bottom < SHOW_AFTER_PX;
        });
        return;
      }

      setVisible(window.scrollY > 280);
    }

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [embed]);

  if (!embed || dismissed) return null;

  return (
    <div
      className={`no-print fixed bottom-24 right-6 z-[45] hidden w-[17.5rem] transition-opacity duration-200 md:block ${
        visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!visible}
    >
      <button
        type="button"
        aria-label="Close floating video"
        onClick={() => setDismissed(true)}
        className="absolute -left-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-sm font-semibold text-ink shadow-md hover:bg-cream"
      >
        ×
      </button>
      <div className="overflow-hidden rounded-xl border border-line bg-ink shadow-[0_16px_40px_rgba(42,34,24,0.22)]">
        <div className="aspect-video">
          <iframe
            src={embed}
            title={`${title} floating video`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
