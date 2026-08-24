"use client";

import { useEffect, useState } from "react";
import { youtubeEmbedUrl } from "@/lib/youtube";

export function RecipeFloatingVideo({ url, title }: { url: string; title: string }) {
  const embed = youtubeEmbedUrl(url);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const target = document.getElementById("studio-video");
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShow(!entry.isIntersecting);
      },
      { threshold: 0.05, rootMargin: "-40px 0px 0px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  if (!embed || dismissed || !show) return null;

  return (
    <div className="no-print fixed bottom-6 right-6 z-[45] hidden w-[17.5rem] md:block">
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
