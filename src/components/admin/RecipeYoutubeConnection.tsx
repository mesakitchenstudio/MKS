"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clearRecipeYoutubeLinkAction } from "@/app/admin/actions";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";
import type { MetadataSyncField, SyncedYoutubeVideo } from "@/lib/youtube-data/recipe-link";
import {
  applyYoutubeMetadataSync,
  applyYoutubeVideoLinkToValues,
  clearYoutubeLinkFromValues,
  previewYoutubeMetadataSync,
  recipeLinkedVideoId,
} from "@/lib/youtube-data/recipe-link";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { YoutubeVideoSelector } from "@/components/admin/YoutubeVideoSelector";

type LinkedVideoPreview = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  durationDisplay: string;
  publishedAt: string;
  privacyStatus: string;
  embeddable: boolean;
  watchUrl: string;
};

const secondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-60";

export function RecipeYoutubeConnection({
  recipeId,
  values,
  aiMeta,
  onValuesChange,
}: {
  recipeId?: string;
  values: Record<string, unknown>;
  aiMeta: RecipeAiMeta | null;
  onValuesChange: (next: Record<string, unknown>) => void;
}) {
  const linkedVideoId = useMemo(() => recipeLinkedVideoId(values), [values]);
  const [preview, setPreview] = useState<LinkedVideoPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [syncPreviewOpen, setSyncPreviewOpen] = useState(false);
  const [syncFields, setSyncFields] = useState<MetadataSyncField[]>([]);
  const [pendingVideoId, setPendingVideoId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!linkedVideoId) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (recipeId) params.set("excludeRecipeId", recipeId);

    fetch(`/api/admin/youtube/videos/${encodeURIComponent(linkedVideoId)}?${params}`)
      .then(async (response) => {
        const data = (await response.json()) as LinkedVideoPreview & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setPreview(null);
          setError(data.error || "Could not load linked video.");
          return;
        }
        setPreview(data);
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("Could not load linked video metadata.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [linkedVideoId, recipeId]);

  async function completeLink(videoId: string, reassignFromRecipeId?: string) {
    if (reassignFromRecipeId) {
      const result = await clearRecipeYoutubeLinkAction(reassignFromRecipeId);
      if (!result.ok) {
        setError(result.error || "Could not unlink the previous recipe.");
        return;
      }
    }

    const params = new URLSearchParams();
    if (recipeId) params.set("excludeRecipeId", recipeId);
    const response = await fetch(
      `/api/admin/youtube/videos/${encodeURIComponent(videoId)}?${params}`,
    );
    const data = (await response.json()) as SyncedYoutubeVideo & { error?: string; watchUrl?: string };
    if (!response.ok) {
      setError(data.error || "Could not load video.");
      return;
    }

    onValuesChange(
      applyYoutubeVideoLinkToValues(values, {
        videoId: data.videoId,
        title: data.title,
        description: data.description,
        thumbnailUrl: data.thumbnailUrl,
        durationDisplay: data.durationDisplay,
        durationSeconds: data.durationSeconds,
        publishedAt: null,
        privacyStatus: data.privacyStatus,
        embeddable: data.embeddable,
        tags: data.tags,
      }),
    );
    setSelectorOpen(false);
    setPendingVideoId(null);
    setReassignTarget(null);
    setError("");
  }

  async function handleSelectVideo(videoId: string, linkedRecipe: { id: string; title: string } | null) {
    if (linkedRecipe && linkedRecipe.id !== recipeId) {
      setPendingVideoId(videoId);
      setReassignTarget(linkedRecipe);
      return;
    }
    await completeLink(videoId);
  }

  function handleUnlink() {
    onValuesChange(clearYoutubeLinkFromValues(values));
    setPreview(null);
    setError("");
  }

  async function openSyncPreview() {
    if (!linkedVideoId) return;
    setError("");
    const response = await fetch(`/api/admin/youtube/videos/${encodeURIComponent(linkedVideoId)}`);
    const data = (await response.json()) as SyncedYoutubeVideo & { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not load video metadata for sync.");
      return;
    }
    setSyncFields(previewYoutubeMetadataSync({ values, aiMeta, video: data }));
    setSyncPreviewOpen(true);
  }

  function applySync() {
    if (!linkedVideoId) return;
    void (async () => {
      const response = await fetch(`/api/admin/youtube/videos/${encodeURIComponent(linkedVideoId)}`);
      const data = (await response.json()) as SyncedYoutubeVideo;
      if (!response.ok) return;
      onValuesChange(applyYoutubeMetadataSync({ values, aiMeta, video: data }));
      setSyncPreviewOpen(false);
    })();
  }

  return (
    <div className="md:col-span-2 rounded-sm border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">YouTube connection</h3>
          <p className="mt-1 text-xs text-muted">
            Connect this recipe to a synced Mesa Kitchen Studio video by video ID.
          </p>
        </div>
        {!linkedVideoId ? (
          <button
            type="button"
            className={`${secondaryBtn} ${adminFocusRing}`}
            onClick={() => setSelectorOpen(true)}
          >
            Select YouTube video
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={() => setSelectorOpen(true)}>
              Change video
            </button>
            <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={handleUnlink}>
              Unlink
            </button>
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-3 text-sm font-semibold text-terracotta" role="alert">
          {error}
        </p>
      ) : null}

      {!linkedVideoId ? (
        <p className="mt-4 text-sm text-muted">No YouTube video linked.</p>
      ) : loading ? (
        <p className="mt-4 text-sm text-muted">Loading linked video…</p>
      ) : preview ? (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.thumbnailUrl}
            alt=""
            className="h-24 w-[10.5rem] shrink-0 rounded-sm object-cover"
          />
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <p className="font-medium text-ink">{preview.title}</p>
            <p className="text-muted">Published {preview.publishedAt}</p>
            <p className="text-muted">Duration {preview.durationDisplay || "—"}</p>
            <p className="font-mono text-xs text-muted">{preview.videoId}</p>
            <p className="text-muted">
              {preview.privacyStatus === "public" ? "Public" : preview.privacyStatus || "Unknown"} ·{" "}
              {preview.embeddable ? "Embeddable" : "Not embeddable"}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              {preview.watchUrl ? (
                <a href={preview.watchUrl} target="_blank" rel="noreferrer" className={adminLinkClass}>
                  View on YouTube
                </a>
              ) : null}
              <button type="button" className={adminLinkClass} onClick={() => void openSyncPreview()}>
                Sync metadata
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Linked to {linkedVideoId}. Sync YouTube data if preview is missing.</p>
      )}

      {selectorOpen ? (
        <YoutubeVideoSelector
          excludeRecipeId={recipeId}
          onClose={() => setSelectorOpen(false)}
          onSelect={(videoId, linkedRecipe) => void handleSelectVideo(videoId, linkedRecipe)}
        />
      ) : null}

      {reassignTarget && pendingVideoId ? (
        <div className="mt-4 rounded-sm border border-terracotta/30 bg-terracotta/5 p-4 text-sm" role="dialog">
          <p className="font-semibold text-ink">Reassign YouTube video?</p>
          <p className="mt-1 text-muted">
            This video is linked to{" "}
            <Link href={`/admin/recipes/${reassignTarget.id}`} className={adminLinkClass}>
              {reassignTarget.title}
            </Link>
            . Reassigning will unlink it from that recipe.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={() => { setReassignTarget(null); setPendingVideoId(null); }}>
              Cancel
            </button>
            <button
              type="button"
              className={`${secondaryBtn} border-terracotta/40 text-terracotta hover:bg-terracotta/5 ${adminFocusRing}`}
              onClick={() => void completeLink(pendingVideoId, reassignTarget.id)}
            >
              Reassign to this recipe
            </button>
          </div>
        </div>
      ) : null}

      {syncPreviewOpen ? (
        <div className="mt-4 rounded-sm border border-line bg-cream/40 p-4 text-sm" role="dialog">
          <p className="font-semibold text-ink">Sync metadata from YouTube</p>
          <p className="mt-1 text-xs text-muted">
            Verified human content and saved chapters are protected.
          </p>
          <ul className="mt-3 space-y-2">
            {syncFields.map((field) => (
              <li key={field.key} className="rounded-sm border border-line/70 bg-paper px-3 py-2">
                <p className="font-semibold text-ink">{field.label}</p>
                <p className="mt-1 text-xs text-muted">Current: {field.current}</p>
                <p className="text-xs text-muted">From YouTube: {field.next}</p>
                {field.skipReason ? (
                  <p className="mt-1 text-xs font-semibold text-olive">{field.skipReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={() => setSyncPreviewOpen(false)}>
              Cancel
            </button>
            <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={applySync}>
              Apply safe updates
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
