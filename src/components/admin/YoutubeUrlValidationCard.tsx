"use client";

import { useEffect, useState } from "react";

type Preview = {
  videoId: string;
  title: string;
  durationDisplay: string;
  thumbnailUrl: string;
  privacyStatus: string;
  embeddable: boolean;
  chapterCount: number;
};

export function YoutubeUrlValidationCard({ videoId }: { videoId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/youtube/preview?videoId=${encodeURIComponent(videoId)}`);
        const data = (await response.json()) as Preview & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setPreview(null);
          setError(data.error || "Could not load YouTube metadata.");
          return;
        }
        setPreview(data);
      } catch {
        if (!cancelled) {
          setPreview(null);
          setError("Could not reach YouTube metadata service.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [videoId]);

  if (loading) {
    return (
      <div className="rounded-sm border border-line bg-cream/40 p-3 text-sm text-muted">
        Checking YouTube metadata…
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="rounded-sm border border-line bg-cream/40 p-3 text-sm">
        <p className="font-semibold text-olive">Valid YouTube video</p>
        <p className="mt-1 text-xs text-muted">{error || "Metadata unavailable."}</p>
      </div>
    );
  }

  const statusNote =
    preview.privacyStatus !== "public"
      ? "Not public on YouTube"
      : !preview.embeddable
        ? "Embedding disabled"
        : null;

  return (
    <div className="flex gap-3 rounded-sm border border-line bg-cream/40 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview.thumbnailUrl || `https://i.ytimg.com/vi/${preview.videoId}/hqdefault.jpg`}
        alt=""
        className="h-16 w-[7.125rem] shrink-0 rounded-sm object-cover"
      />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-olive">Valid YouTube video</p>
        <p className="mt-0.5 truncate font-medium text-ink">{preview.title}</p>
        <p className="mt-0.5 text-xs text-muted">
          {preview.durationDisplay || "—"}
          {preview.chapterCount > 0 ? ` · ${preview.chapterCount} chapters in description` : ""}
        </p>
        {statusNote ? <p className="mt-1 text-xs font-semibold text-terracotta">{statusNote}</p> : null}
      </div>
    </div>
  );
}
