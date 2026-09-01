"use client";

import { useMemo, useRef, useState } from "react";
import {
  instructionChapterCoverage,
  hasCanonicalInstructionChapters,
  normalizeInstructionGroups,
} from "@/lib/instruction-chapters";
import { listChapterLabelOverrides } from "@/lib/instruction-chapter-labels";
import { formatYoutubeChapterExportLine } from "@/lib/youtube-chapter-sync/export";
import { diffChapterBlockLines } from "@/lib/youtube-chapter-sync/description-patch";
import {
  chapterSyncApplyUiFailure,
  chapterSyncApplyUiStart,
  chapterSyncApplyUiSuccess,
  createChapterSyncApplyFlightGuard,
  parseChapterSyncApplyHttpResponse,
} from "@/lib/youtube-chapter-sync/apply-response";
import { readChapterSyncMetadata } from "@/lib/youtube-chapter-sync/sync-metadata";
import { adminFocusRing } from "@/lib/admin-ui";
import { recipeLinkedVideoId } from "@/lib/youtube-data/recipe-link";
import { youtubeWatchUrl } from "@/lib/youtube";

type PreviewResponse = {
  ok: true;
  previewId: string;
  previewToken: string;
  videoId: string;
  videoTitle: string;
  export: {
    items: Array<{ timestamp: number; label: string; source: string; instructionIndex?: number }>;
    ready: boolean;
    errors: Array<{ message: string }>;
    warnings: Array<{ message: string }>;
  };
  mappedSections: number;
  existingChapterBlock?: string;
  existingBlockLineCount?: number;
  replacementStrategy: string;
  beforeDescription: string;
  proposedDescription: string;
  beforeHash: string;
  proposedBytes: number;
  byteLimit: number;
  unchangedDescriptionBytes: number;
  chapterBlockBytes: number;
  syncStatus: string;
  introLabel: string;
  oauth: {
    connected: boolean;
    canReadAnalytics: boolean;
    canWrite: boolean;
    reconnectUrl?: string;
  };
  byteError?: string;
};

type Props = {
  recipeId: string;
  values: Record<string, unknown>;
  isDirty: boolean;
  videoDurationSeconds?: number;
};

const STATUS_LABELS: Record<string, string> = {
  not_synced: "Not synced",
  ready_to_sync: "Ready to sync",
  in_sync: "In sync",
  mesa_changed: "Mesa chapters changed",
  youtube_changed: "YouTube description changed",
  reconnect_required: "Reconnect required",
  conflict: "Conflict",
  not_youtube_ready: "Not YouTube-ready",
};

function formatSyncedAt(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function YoutubeChapterSyncPanel({ recipeId, values, isDirty, videoDurationSeconds }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [introLabelDraft, setIntroLabelDraft] = useState("");
  const [showBefore, setShowBefore] = useState(false);
  const [showProposed, setShowProposed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const applyFlightRef = useRef(createChapterSyncApplyFlightGuard());

  const groups = useMemo(() => normalizeInstructionGroups(values.instructions), [values.instructions]);
  const coverage = useMemo(() => instructionChapterCoverage(groups), [groups]);
  const linkedVideoId = useMemo(() => recipeLinkedVideoId(values), [values]);
  const canonical = hasCanonicalInstructionChapters(groups);
  const chapterLabelOverrides = useMemo(() => listChapterLabelOverrides(values.instructions), [values.instructions]);
  const storedSyncMeta = useMemo(() => readChapterSyncMetadata(values), [values]);

  const proposedChapterBlock = useMemo(() => {
    if (!preview?.export.items.length) return "";
    return preview.export.items
      .map((item) => formatYoutubeChapterExportLine(item.timestamp, item.label))
      .join("\n");
  }, [preview]);

  const chapterDiff = useMemo(() => {
    if (!preview) return null;
    const beforeBlock = preview.existingChapterBlock ?? "";
    return diffChapterBlockLines(beforeBlock, proposedChapterBlock);
  }, [preview, proposedChapterBlock]);

  const displayedLastSyncedAt = lastSyncedAt ?? storedSyncMeta?.lastSyncedAt ?? null;

  async function loadPreview(introOverride?: string) {
    if (!recipeId || isDirty) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/youtube/chapter-sync/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId,
          introLabel: (introOverride ?? introLabelDraft.trim()) || undefined,
        }),
      });
      let payload: PreviewResponse & { error?: string; code?: string };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        throw new Error("Unexpected preview response from server.");
      }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not generate preview.");
      }
      setPreview(payload);
      setIntroLabelDraft(payload.introLabel);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setLoading(false);
    }
  }

  async function applySync() {
    if (!preview || isDirty) return;
    if (!applyFlightRef.current.tryAcquire()) return;

    const start = chapterSyncApplyUiStart();
    setApplying(start.applying);
    setModalError(start.modalError);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/youtube/chapter-sync/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, previewToken: preview.previewToken }),
      });

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        const failure = chapterSyncApplyUiFailure("Unexpected server response. Try again.");
        setApplying(failure.applying ?? false);
        setModalError(failure.modalError ?? null);
        setError(failure.modalError ?? null);
        return;
      }

      const parsed = parseChapterSyncApplyHttpResponse({
        ok: response.ok,
        status: response.status,
        body,
      });

      if (!parsed.ok) {
        const failure = chapterSyncApplyUiFailure(parsed.message);
        setApplying(failure.applying ?? false);
        setModalError(failure.modalError ?? null);
        setError(failure.modalError ?? null);
        return;
      }

      const successState = chapterSyncApplyUiSuccess({
        lastSyncedAt: parsed.lastSyncedAt,
        warning: parsed.warning,
      });
      setConfirmOpen(successState.confirmOpen ?? false);
      setApplying(successState.applying ?? false);
      setModalError(successState.modalError ?? null);
      setSuccess(successState.successMessage ?? null);
      setLastSyncedAt(successState.lastSyncedAt ?? null);
      await loadPreview(introLabelDraft);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not reach Mesa. Check your connection and try again.";
      const failure = chapterSyncApplyUiFailure(message);
      setApplying(failure.applying ?? false);
      setModalError(failure.modalError ?? null);
      setError(failure.modalError ?? null);
    } finally {
      applyFlightRef.current.release();
    }
  }

  function openConfirmModal() {
    setModalError(null);
    setConfirmOpen(true);
  }

  function closeConfirmModal() {
    if (applying) return;
    setConfirmOpen(false);
    setModalError(null);
  }

  if (!linkedVideoId || !canonical) return null;

  const updateDisabled =
    isDirty ||
    !preview ||
    !preview.export.ready ||
    preview.replacementStrategy === "ambiguous" ||
    preview.replacementStrategy === "already_in_sync" ||
    !preview.oauth.canWrite ||
    Boolean(preview.byteError);

  return (
    <section className="mb-5 rounded-sm border border-line/80 bg-white/60 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted">YouTube chapter sync</h3>
        {preview ? (
          <span className="text-xs font-medium text-muted">
            {STATUS_LABELS[preview.syncStatus] ?? preview.syncStatus}
          </span>
        ) : null}
      </div>

      <p className="mb-3 text-sm text-muted">
        {coverage.mappedSections}/{coverage.totalSections} Mesa chapters mapped
        {preview?.export.ready ? " · YouTube ready ✓" : ""}
      </p>

      {displayedLastSyncedAt ? (
        <p className="mb-3 text-sm text-muted">
          Last synced: <span className="font-medium text-ink">{formatSyncedAt(displayedLastSyncedAt)}</span>
        </p>
      ) : null}

      {isDirty ? (
        <p className="mb-3 text-sm text-terracotta/90">
          Save recipe changes before syncing chapters to YouTube.
        </p>
      ) : null}

      {chapterLabelOverrides.length ? (
        <div className="mb-3 rounded-sm border border-terracotta/30 bg-terracotta/5 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">
            YouTube chapter label overrides
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {chapterLabelOverrides.map((row) => (
              <li key={row.groupIndex}>
                <span className="text-muted">Section {row.groupIndex + 1}:</span>{" "}
                <span className="font-medium text-ink">{row.sectionTitle}</span>
                <br />
                <span className="text-muted">YouTube chapter label:</span>{" "}
                <span className="font-semibold text-terracotta">{row.youtubeLabel}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Export uses the YouTube chapter label, not the section title. Clear overrides in the
            instruction editor when the section title is correct.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 text-sm font-semibold text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mb-3 text-sm font-semibold text-emerald-800" role="status">
          {success}
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || isDirty || !recipeId}
          className={`rounded-sm border border-line bg-cream/40 px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50 ${adminFocusRing}`}
          onClick={() => void loadPreview()}
        >
          {loading ? "Generating preview…" : preview ? "Refresh preview" : "Preview YouTube chapters"}
        </button>
        {preview?.videoId ? (
          <a
            href={youtubeWatchUrl(preview.videoId) ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="self-center text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline"
          >
            View on YouTube
          </a>
        ) : null}
      </div>

      {preview ? (
        <div className="space-y-4 border-t border-line/70 pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Video</p>
            <p className="text-sm font-medium text-ink">{preview.videoTitle}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <p className="text-sm text-muted">
              Mesa chapters: <span className="font-medium text-ink">{preview.mappedSections} mapped</span>
            </p>
            <p className="text-sm text-muted">
              YouTube export:{" "}
              <span className="font-medium text-ink">{preview.export.items.length} chapters</span>
            </p>
          </div>

          {!preview.export.ready ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-terracotta">
              {preview.export.errors.map((issue) => (
                <li key={issue.message}>{issue.message}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-medium text-emerald-800">Ready for YouTube ✓</p>
          )}

          {preview.export.items.some((item) => item.source === "synthetic_intro") ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Export intro label (YouTube only)
              </span>
              <input
                type="text"
                value={introLabelDraft}
                onChange={(event) => setIntroLabelDraft(event.target.value)}
                className="w-full max-w-md rounded-sm border border-line bg-white px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                className={`mt-2 text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline ${adminFocusRing}`}
                onClick={() => void loadPreview(introLabelDraft)}
              >
                Update preview with intro label
              </button>
            </label>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Proposed chapters
            </p>
            <pre className="overflow-x-auto rounded-sm bg-cream/30 p-3 text-xs leading-relaxed text-ink">
              {proposedChapterBlock}
            </pre>
          </div>

          {preview.replacementStrategy === "append" ? (
            <p className="text-sm text-muted">
              No existing YouTube chapter block detected. Mesa will append the chapter list to the
              description.
            </p>
          ) : null}
          {preview.replacementStrategy === "replace_detected" ||
          preview.replacementStrategy === "replace_previous_mesa" ? (
            <p className="text-sm text-muted">
              Existing chapter block detected. {preview.existingBlockLineCount ?? "Several"} lines
              will be replaced. Only the chapter section will change.
            </p>
          ) : null}
          {preview.replacementStrategy === "ambiguous" ? (
            <p className="text-sm text-terracotta">
              Mesa found multiple possible timestamp sections and will not choose automatically.
              Clean up the YouTube description manually, then refresh preview.
            </p>
          ) : null}
          {preview.replacementStrategy === "already_in_sync" ? (
            <p className="text-sm font-semibold text-emerald-800">Already in sync with YouTube.</p>
          ) : null}

          {chapterDiff && preview.existingChapterBlock ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted">Current chapter block</p>
                <pre className="max-h-40 overflow-auto rounded-sm bg-cream/20 p-2 text-xs">
                  {preview.existingChapterBlock}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted">Proposed chapter block</p>
                <pre className="max-h-40 overflow-auto rounded-sm bg-cream/20 p-2 text-xs">
                  {proposedChapterBlock}
                </pre>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted">
            Unchanged description text: {preview.unchangedDescriptionBytes.toLocaleString()} bytes ·
            Chapter block: {preview.chapterBlockBytes.toLocaleString()} bytes · Proposed:{" "}
            {preview.proposedBytes.toLocaleString()} / {preview.byteLimit.toLocaleString()} bytes
          </p>
          {preview.byteError ? <p className="text-sm text-terracotta">{preview.byteError}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={`text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline ${adminFocusRing}`}
              onClick={() => setShowBefore((value) => !value)}
            >
              {showBefore ? "Hide" : "View"} current description
            </button>
            <button
              type="button"
              className={`text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline ${adminFocusRing}`}
              onClick={() => setShowProposed((value) => !value)}
            >
              {showProposed ? "Hide" : "View"} proposed description
            </button>
          </div>
          {showBefore ? (
            <pre className="max-h-48 overflow-auto rounded-sm border border-line/70 bg-white p-3 text-xs whitespace-pre-wrap">
              {preview.beforeDescription}
            </pre>
          ) : null}
          {showProposed ? (
            <pre className="max-h-48 overflow-auto rounded-sm border border-line/70 bg-white p-3 text-xs whitespace-pre-wrap">
              {preview.proposedDescription}
            </pre>
          ) : null}

          {!preview.oauth.canWrite ? (
            <p className="text-sm text-muted">
              Reconnect YouTube and allow Mesa to update video descriptions to enable chapter
              sync updates.{" "}
              {preview.oauth.reconnectUrl ? (
                <a
                  href={preview.oauth.reconnectUrl}
                  className="font-semibold text-terracotta underline-offset-2 hover:underline"
                >
                  Reconnect YouTube with description editing
                </a>
              ) : null}
            </p>
          ) : null}

          <button
            type="button"
            disabled={updateDisabled || applying}
            className={`rounded-sm bg-terracotta px-3 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50 ${adminFocusRing}`}
            onClick={openConfirmModal}
          >
            Update YouTube description
          </button>
        </div>
      ) : null}

      {confirmOpen && preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-w-md rounded-sm border border-line bg-white p-5 shadow-lg" role="dialog" aria-modal="true" aria-labelledby="chapter-sync-apply-title">
            <h4 id="chapter-sync-apply-title" className="mb-2 text-base font-semibold text-ink">
              Update chapters on YouTube?
            </h4>
            <p className="mb-1 text-sm text-muted">
              Video: <span className="font-medium text-ink">{preview.videoTitle}</span>
            </p>
            <p className="mb-4 text-sm text-muted">
              Mesa will update the video&apos;s description chapter block. Other description text,
              title, tags, and category will be preserved.
            </p>

            {applying ? (
              <p className="mb-4 text-sm font-semibold text-ink" role="status" aria-live="polite">
                Updating YouTube…
              </p>
            ) : null}

            {modalError ? (
              <p className="mb-4 text-sm font-semibold text-terracotta" role="alert">
                {modalError}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={applying}
                className={`rounded-sm border border-line px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${adminFocusRing}`}
                onClick={closeConfirmModal}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={applying}
                className={`rounded-sm bg-terracotta px-3 py-1.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${adminFocusRing}`}
                onClick={() => void applySync()}
              >
                Update YouTube
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
