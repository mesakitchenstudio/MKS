"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";

type VideoRow = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  durationDisplay: string;
  linkedRecipe: { id: string; title: string; slug: string } | null;
};

const secondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function YoutubeVideoSelector({
  excludeRecipeId,
  onClose,
  onSelect,
}: {
  excludeRecipeId?: string;
  onClose: () => void;
  onSelect: (videoId: string, linkedRecipe: { id: string; title: string; slug: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (excludeRecipeId) params.set("excludeRecipeId", excludeRecipeId);
        const response = await fetch(`/api/admin/youtube/videos?${params}`);
        const data = (await response.json()) as { videos?: VideoRow[]; error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setVideos([]);
          setError(data.error || "Could not load videos.");
          return;
        }
        setVideos(data.videos ?? []);
      } catch {
        if (!cancelled) setError("Could not reach YouTube video list.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, excludeRecipeId]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-sm border border-line bg-paper shadow-lg"
        role="dialog"
        aria-label="Select YouTube video"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h4 className="font-serif text-lg text-ink">Select YouTube video</h4>
          <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="border-b border-line px-4 py-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search synced videos…"
            className="h-10 w-full rounded-sm border border-line bg-paper px-3 text-sm outline-none focus:border-olive focus:ring-2 focus:ring-olive/15"
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {loading ? <p className="px-3 py-6 text-sm text-muted">Loading videos…</p> : null}
          {error ? <p className="px-3 py-6 text-sm text-terracotta">{error}</p> : null}
          {!loading && !error && videos.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted">No synced videos found. Run Sync YouTube first.</p>
          ) : null}
          <ul className="space-y-1">
            {videos.map((video) => (
              <li key={video.videoId}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-sm px-3 py-3 text-left transition-colors hover:bg-cream/60 ${adminFocusRing}`}
                  onClick={() => onSelect(video.videoId, video.linkedRecipe)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={video.thumbnailUrl} alt="" className="h-12 w-[4.25rem] shrink-0 rounded-sm object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{video.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {video.publishedAt} · {video.durationDisplay}
                    </span>
                    {video.linkedRecipe ? (
                      <span className="mt-1 block text-xs text-terracotta">
                        Linked to:{" "}
                        <Link
                          href={`/admin/recipes/${video.linkedRecipe.id}`}
                          className={adminLinkClass}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {video.linkedRecipe.title}
                        </Link>
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs text-olive">Available</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
