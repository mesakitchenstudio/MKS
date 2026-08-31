"use client";

import { useId, useState } from "react";
import { AiConfidenceBadge } from "@/components/admin/AiConfidenceBadge";
import type { AiConfidence } from "@/lib/ai-recipe/types";
import { adminFocusRing } from "@/lib/admin-ui";
import {
  applyRawYoutubeMetadataJson,
  prettyPrintYoutubeMetadataBlob,
  youtubeMetadataToEditorState,
  type YoutubeMetadataEditorState,
  type YoutubeRelatedVideoRow,
  type YoutubeTimestampRow,
} from "@/lib/youtube-metadata-editor";

const inputClass =
  "h-9 w-full rounded-sm border border-line bg-paper px-3 text-sm text-ink outline-none transition-[color,box-shadow,border-color] duration-150 placeholder:text-muted focus:border-olive focus:ring-2 focus:ring-olive/15";

const textareaClass =
  "min-h-[4.5rem] w-full resize-y rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-olive focus:ring-2 focus:ring-olive/15";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-60";

const removeBtn =
  "shrink-0 text-xs font-semibold text-muted/75 transition-colors hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const reorderBtn = (disabled: boolean) =>
  `min-w-[2.25rem] px-2 py-1 text-xs font-semibold transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta ${
    disabled ? "cursor-not-allowed text-muted/35" : "text-muted hover:bg-cream hover:text-terracotta"
  }`;

function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function SectionHeading({
  title,
  description,
  confidence,
  sourceNote,
}: {
  title: string;
  description?: string;
  confidence?: AiConfidence;
  sourceNote?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <AiConfidenceBadge confidence={confidence} sourceNote={sourceNote} />
      </div>
      {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
    </div>
  );
}

function ReorderRowControls({
  label,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  label: string;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label={`Reorder ${label}`}
        className="inline-flex overflow-hidden rounded-sm border border-line bg-paper"
      >
        <button
          type="button"
          aria-label={`Move ${label} up`}
          disabled={index === 0}
          className={`${reorderBtn(index === 0)} border-r border-line`}
          onClick={onMoveUp}
        >
          Up
        </button>
        <button
          type="button"
          aria-label={`Move ${label} down`}
          disabled={index >= total - 1}
          className={reorderBtn(index >= total - 1)}
          onClick={onMoveDown}
        >
          Down
        </button>
      </div>
      <button type="button" aria-label={`Remove ${label}`} className={removeBtn} onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function confidenceAt(
  confidenceByPath: Record<string, { confidence: AiConfidence; sourceNote?: string }> | undefined,
  path: string,
) {
  return confidenceByPath?.[path];
}

export function YoutubeMetadataEditor({
  value,
  onChange,
  confidenceByPath,
  invalidPaths,
}: {
  value: unknown;
  onChange: (state: YoutubeMetadataEditorState) => void;
  confidenceByPath?: Record<string, { confidence: AiConfidence; sourceNote?: string }>;
  invalidPaths?: Set<string>;
}) {
  const rawPanelId = useId();
  const state = youtubeMetadataToEditorState(value);

  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [rawError, setRawError] = useState("");

  function patch(partial: Partial<YoutubeMetadataEditorState>) {
    onChange({ ...state, ...partial });
  }

  function patchTimestamp(index: number, partial: Partial<YoutubeTimestampRow>) {
    patch({
      timestamps: state.timestamps.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...partial } : row,
      ),
    });
  }

  function patchRelated(index: number, partial: Partial<YoutubeRelatedVideoRow>) {
    patch({
      relatedVideos: state.relatedVideos.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...partial } : row,
      ),
    });
  }

  function openRawPanel() {
    setRawText(prettyPrintYoutubeMetadataBlob(state));
    setRawError("");
    setRawOpen(true);
  }

  function applyRawJson() {
    const result = applyRawYoutubeMetadataJson(state, rawText);
    if (!result.ok) {
      setRawError(result.error);
      return;
    }
    onChange(result.state);
    setRawError("");
    setRawOpen(false);
  }

  const hookConfidence = confidenceAt(confidenceByPath, "values.youtube.hook")
    ?? confidenceAt(confidenceByPath, "values.youtube");
  const durationConfidence = confidenceAt(confidenceByPath, "values.youtube.duration");
  const playlistConfidence = confidenceAt(confidenceByPath, "values.youtube.playlistUrl");

  return (
    <div className="space-y-6">
      <section className="rounded-sm border border-line/80 bg-cream/20 p-4">
        <SectionHeading
          title="Video details"
          description="Optional copy and duration shown with the main walkthrough video."
          confidence={hookConfidence?.confidence}
          sourceNote={hookConfidence?.sourceNote}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-ink md:col-span-2">
            Hook
            <input
              type="text"
              value={state.hook}
              onChange={(event) => patch({ hook: event.target.value })}
              placeholder="One sentence under the video heading on the public recipe page."
              className={inputClass}
              aria-invalid={invalidPaths?.has("hook") ?? false}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              Duration
              <AiConfidenceBadge
                confidence={durationConfidence?.confidence}
                sourceNote={durationConfidence?.sourceNote}
              />
            </span>
            <input
              type="text"
              value={state.duration}
              onChange={(event) => patch({ duration: event.target.value })}
              placeholder="e.g. 4:21"
              className={inputClass}
              aria-invalid={invalidPaths?.has("duration") ?? false}
            />
          </label>
        </div>
      </section>

      <section className="rounded-sm border border-line/80 bg-cream/20 p-4">
        <SectionHeading
          title="Video chapters"
          description="Optional timestamps for “Watch by step” on the public recipe. Use MM:SS or H:MM:SS."
          confidence={confidenceAt(confidenceByPath, "values.youtube.timestamps")?.confidence}
          sourceNote={confidenceAt(confidenceByPath, "values.youtube.timestamps")?.sourceNote}
        />

        {(() => {
          const chapterSourceNote =
            confidenceAt(confidenceByPath, "values.youtube.timestamps")?.sourceNote ?? "";
          const syncedFromYoutube =
            /youtube description|synced from youtube/i.test(chapterSourceNote) ||
            (/from youtube/i.test(chapterSourceNote) && state.timestamps.length > 0);
          return syncedFromYoutube && state.timestamps.length ? (
            <p className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
              Synced from YouTube
            </p>
          ) : null;
        })()}

        {state.timestamps.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-3 font-semibold">Time</th>
                  <th className="pb-2 pr-3 font-semibold">Label</th>
                  <th className="pb-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.timestamps.map((row, index) => {
                  const timePath = `timestamps.${index}.time`;
                  const labelPath = `timestamps.${index}.label`;
                  const rowConfidence =
                    confidenceAt(confidenceByPath, `values.youtube.${labelPath}`)
                    ?? confidenceAt(confidenceByPath, `values.youtube.${timePath}`);
                  return (
                    <tr key={`chapter-${index}`} className="border-b border-line/70 align-top">
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          value={row.timeInput}
                          onChange={(event) => patchTimestamp(index, { timeInput: event.target.value })}
                          placeholder="00:13"
                          className={`${inputClass}${invalidPaths?.has(timePath) ? " border-terracotta/60" : ""}`}
                          aria-label={`Chapter ${index + 1} time`}
                          aria-invalid={invalidPaths?.has(timePath) ?? false}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={row.label}
                            onChange={(event) => patchTimestamp(index, { label: event.target.value })}
                            placeholder="Mixing liquid & yeast"
                            className={`${inputClass}${invalidPaths?.has(labelPath) ? " border-terracotta/60" : ""}`}
                            aria-label={`Chapter ${index + 1} label`}
                            aria-invalid={invalidPaths?.has(labelPath) ?? false}
                          />
                          {rowConfidence ? (
                            <AiConfidenceBadge
                              confidence={rowConfidence.confidence}
                              sourceNote={rowConfidence.sourceNote}
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2">
                        <ReorderRowControls
                          label={`chapter ${index + 1}`}
                          index={index}
                          total={state.timestamps.length}
                          onMoveUp={() =>
                            patch({ timestamps: moveItem(state.timestamps, index, index - 1) })
                          }
                          onMoveDown={() =>
                            patch({ timestamps: moveItem(state.timestamps, index, index + 1) })
                          }
                          onRemove={() =>
                            patch({
                              timestamps: state.timestamps.filter((_, rowIndex) => rowIndex !== index),
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No chapters yet.</p>
        )}

        <button
          type="button"
          className={`mt-3 ${secondaryBtn} ${adminFocusRing}`}
          onClick={() =>
            patch({
              timestamps: [...state.timestamps, { timeInput: "", label: "" }],
            })
          }
        >
          + Add chapter
        </button>

        <div className="mt-4 rounded-sm border border-dashed border-line/80 bg-paper/60 px-3 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Sync chapters to YouTube
          </p>
          <p className="mt-1 text-xs text-muted">
            Prepared preview-only service. Requires{" "}
            <code className="text-[0.7rem]">YOUTUBE_CHAPTER_SYNC_ENABLED=true</code> and write OAuth
            (<code className="text-[0.7rem]">youtube.force-ssl</code>). Never runs on recipe save.
          </p>
          <button
            type="button"
            className={`mt-2 ${secondaryBtn} ${adminFocusRing}`}
            disabled
            title="Feature-gated until YouTube write OAuth is configured"
          >
            Sync chapters to YouTube (disabled)
          </button>
        </div>
      </section>

      <section className="rounded-sm border border-line/80 bg-cream/20 p-4">
        <SectionHeading
          title="Playlist"
          confidence={playlistConfidence?.confidence}
          sourceNote={playlistConfidence?.sourceNote}
        />
        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          Playlist URL
          <input
            type="url"
            value={state.playlistUrl}
            onChange={(event) => patch({ playlistUrl: event.target.value })}
            placeholder="https://www.youtube.com/playlist?list=..."
            className={`${inputClass}${invalidPaths?.has("playlistUrl") ? " border-terracotta/60" : ""}`}
            aria-invalid={invalidPaths?.has("playlistUrl") ?? false}
          />
        </label>
        <label className="mt-3 grid gap-1.5 text-sm font-semibold text-ink">
          Playlist label
          <input
            type="text"
            value={state.playlistLabel}
            onChange={(event) => patch({ playlistLabel: event.target.value })}
            placeholder="e.g. Mexican recipes"
            className={inputClass}
          />
        </label>
      </section>

      <section className="rounded-sm border border-line/80 bg-cream/20 p-4">
        <SectionHeading
          title="Related videos"
          description="Optional YouTube URLs shown in the related videos section on the public recipe."
        />

        {state.relatedVideos.length ? (
          <ul className="space-y-3">
            {state.relatedVideos.map((row, index) => {
              const urlPath = `relatedVideos.${index}.url`;
              const rowConfidence = confidenceAt(
                confidenceByPath,
                `values.youtube.${urlPath}`,
              );
              return (
                <li
                  key={`related-${index}`}
                  className="flex flex-col gap-3 border border-line/70 bg-paper p-3 sm:flex-row sm:items-start"
                >
                  <div className="min-w-0 flex-1 space-y-3">
                    <label className="grid gap-1.5 text-sm font-semibold text-ink">
                      YouTube URL
                      <input
                        type="url"
                        value={row.url}
                        onChange={(event) => patchRelated(index, { url: event.target.value })}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className={`${inputClass}${invalidPaths?.has(urlPath) ? " border-terracotta/60" : ""}`}
                        aria-invalid={invalidPaths?.has(urlPath) ?? false}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="grid gap-1.5 text-sm font-semibold text-ink sm:col-span-2">
                        Title
                        <input
                          type="text"
                          value={row.title}
                          onChange={(event) => patchRelated(index, { title: event.target.value })}
                          placeholder="Optional — defaults from URL on save"
                          className={inputClass}
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-ink">
                        Duration
                        <input
                          type="text"
                          value={row.duration}
                          onChange={(event) => patchRelated(index, { duration: event.target.value })}
                          placeholder="5:12"
                          className={inputClass}
                        />
                      </label>
                    </div>
                    <label className="grid gap-1.5 text-sm font-semibold text-ink">
                      Category label
                      <input
                        type="text"
                        value={row.label}
                        onChange={(event) => patchRelated(index, { label: event.target.value })}
                        placeholder="e.g. Mexican"
                        className={inputClass}
                      />
                    </label>
                    {rowConfidence ? (
                      <AiConfidenceBadge
                        confidence={rowConfidence.confidence}
                        sourceNote={rowConfidence.sourceNote}
                      />
                    ) : null}
                  </div>
                  <ReorderRowControls
                    label={`related video ${index + 1}`}
                    index={index}
                    total={state.relatedVideos.length}
                    onMoveUp={() =>
                      patch({ relatedVideos: moveItem(state.relatedVideos, index, index - 1) })
                    }
                    onMoveDown={() =>
                      patch({ relatedVideos: moveItem(state.relatedVideos, index, index + 1) })
                    }
                    onRemove={() =>
                      patch({
                        relatedVideos: state.relatedVideos.filter((_, rowIndex) => rowIndex !== index),
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No related videos yet.</p>
        )}

        <button
          type="button"
          className={`mt-3 ${secondaryBtn} ${adminFocusRing}`}
          onClick={() =>
            patch({
              relatedVideos: [...state.relatedVideos, { url: "", title: "", duration: "", label: "" }],
            })
          }
        >
          + Add related video
        </button>
      </section>

      <section className="rounded-sm border border-line bg-paper">
        <button
          type="button"
          className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${adminFocusRing}`}
          aria-expanded={rawOpen}
          aria-controls={rawPanelId}
          onClick={() => (rawOpen ? setRawOpen(false) : openRawPanel())}
        >
          <div>
            <p className="text-sm font-semibold text-ink">Raw metadata JSON</p>
            <p className="mt-0.5 text-xs text-muted">Advanced / developer view. Validates before applying.</p>
          </div>
          <span className="text-sm font-semibold text-muted" aria-hidden>
            {rawOpen ? "−" : "+"}
          </span>
        </button>
        {rawOpen ? (
          <div id={rawPanelId} className="border-t border-line px-4 py-4">
            <textarea
              rows={12}
              value={rawText}
              onChange={(event) => {
                setRawText(event.target.value);
                setRawError("");
              }}
              className={`${textareaClass} font-mono text-xs`}
              spellCheck={false}
            />
            {rawError ? (
              <p className="mt-2 text-xs font-semibold text-terracotta" role="alert">
                {rawError}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={applyRawJson}>
                Apply JSON to fields
              </button>
              <button
                type="button"
                className={`${secondaryBtn} ${adminFocusRing}`}
                onClick={() => setRawText(prettyPrintYoutubeMetadataBlob(state))}
              >
                Reset from fields
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
