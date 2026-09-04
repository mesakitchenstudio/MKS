"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AdminYouTubeVerificationPlayer } from "@/components/admin/AdminYouTubeVerificationPlayer";
import { useInstructionVideoWorkspace } from "@/components/admin/InstructionVideoWorkspaceContext";
import {
  formatTimestampInput,
  resolveChapterLabel,
  resolveInstructionChapter,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";
import { adminFocusRing, adminSecondaryButtonClass } from "@/lib/admin-ui";

const SECTION_MEDIA = "recipe-section-media";

const quietBtn = `text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline ${adminFocusRing}`;

function formatPlayheadClock(seconds: number, duration: number | null) {
  const current = formatTimestampInput(Math.max(0, Math.floor(seconds)));
  if (duration == null || duration <= 0) return current;
  return `${current} / ${formatTimestampInput(duration)}`;
}

export function InstructionVideoWorkspace({
  instructionGroups,
  onSetStartFromPlayhead,
  onSetEndFromPlayhead,
  endPlayheadFeedbackByGroup = {},
}: {
  instructionGroups: InstructionGroupWithChapters[];
  onSetStartFromPlayhead?: (groupIndex: number, seconds: number) => void;
  onSetEndFromPlayhead?: (groupIndex: number, seconds: number) => void;
  endPlayheadFeedbackByGroup?: Record<number, string>;
}) {
  const workspace = useInstructionVideoWorkspace();
  const {
    linkedVideo,
    videoPanelVisible,
    setVideoPanelVisible,
    playerError,
    setPlayerError,
    durationSeconds,
    activeSectionIndex,
    playingSectionIndex,
    playerRef,
    stickyTopPx,
    stickyBottomPx,
    readPlayheadSeconds,
    onPlayerReady,
    onPlayheadChange,
  } = workspace;

  const activeGroup =
    activeSectionIndex != null ? instructionGroups[activeSectionIndex] : undefined;
  const activeResolved =
    activeGroup && activeSectionIndex != null
      ? resolveInstructionChapter({
          group: activeGroup,
          groupIndex: activeSectionIndex,
          allGroups: instructionGroups,
          videoDurationSeconds: durationSeconds ?? undefined,
        })
      : null;
  const activeLabel = activeGroup ? resolveChapterLabel(activeGroup) : null;
  const playheadRounded = readPlayheadSeconds();
  const [displayTimeSeconds, setDisplayTimeSeconds] = useState(0);

  const handlePlayheadChange = useCallback(
    (seconds: number, duration: number | null) => {
      setDisplayTimeSeconds(seconds);
      onPlayheadChange(seconds, duration);
    },
    [onPlayheadChange],
  );

  const showEmbedPlayer = Boolean(linkedVideo?.embeddable && !playerError);

  return (
    <aside
      className={
        videoPanelVisible
          ? "overflow-y-auto border-b border-line/70 pb-4 2xl:sticky 2xl:self-start 2xl:border-b-0 2xl:border-l 2xl:border-line/70 2xl:pb-0 2xl:pl-4"
          : "pointer-events-none fixed left-0 top-0 -z-50 h-px w-px overflow-hidden opacity-0"
      }
      style={
        videoPanelVisible
          ? {
              top: stickyTopPx,
              maxHeight: `calc(100vh - ${stickyTopPx}px - ${stickyBottomPx}px)`,
            }
          : undefined
      }
      aria-hidden={!videoPanelVisible}
      aria-label="Video verification workspace"
    >
      {videoPanelVisible ? (
        <div className="mb-3 flex items-start justify-between gap-2">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
            Video
          </p>
          <button
            type="button"
            className={quietBtn}
            onClick={() => setVideoPanelVisible(false)}
          >
            Hide video
          </button>
        </div>
      ) : null}

      {!linkedVideo ? (
        videoPanelVisible ? (
          <div className="py-2 text-sm text-muted">
            <p className="font-medium text-ink">No linked video</p>
            <p className="mt-1 text-xs leading-relaxed">
              Link a YouTube video in Media to verify instruction timestamps.
            </p>
            <Link
              href={`#${SECTION_MEDIA}`}
              className={`mt-2 inline-block text-xs font-semibold text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`}
            >
              Open Media settings
            </Link>
          </div>
        ) : null
      ) : (
        <>
          {videoPanelVisible ? (
            <div className="mb-3 space-y-1">
              <p className="line-clamp-2 font-serif text-sm leading-snug text-ink">
                {linkedVideo.title}
              </p>
              {linkedVideo.durationDisplay ? (
                <p className="text-xs text-muted">{linkedVideo.durationDisplay}</p>
              ) : null}
              <Link
                href={`#${SECTION_MEDIA}`}
                className={`text-xs font-semibold text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`}
              >
                Open Media settings
              </Link>
            </div>
          ) : null}

          {!linkedVideo.embeddable ? (
            videoPanelVisible ? (
              <div className="mb-3 rounded-sm border border-line/70 bg-paper/60 px-3 py-3 text-xs text-muted">
                Video preview unavailable. You can continue editing timestamps manually.
              </div>
            ) : null
          ) : playerError ? (
            videoPanelVisible ? (
              <div className="mb-3 rounded-sm border border-line/70 bg-paper/60 px-3 py-3 text-xs text-muted">
                {playerError} You can continue editing timestamps manually.
              </div>
            ) : null
          ) : showEmbedPlayer ? (
            <AdminYouTubeVerificationPlayer
              ref={playerRef}
              videoId={linkedVideo.videoId}
              title={linkedVideo.title}
              onReady={onPlayerReady}
              onError={setPlayerError}
              onPlayheadChange={handlePlayheadChange}
            />
          ) : null}

          {videoPanelVisible ? (
            <>
              <p
                className="mt-3 text-center text-sm font-semibold tabular-nums text-ink"
                aria-live="polite"
              >
                {formatPlayheadClock(displayTimeSeconds, durationSeconds)}
              </p>

              {activeGroup && activeSectionIndex != null ? (
                <div className="mt-4 border-t border-line/70 pt-3">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
                    Current section
                  </p>
                  <p className="mt-1 font-serif text-sm font-semibold text-ink">{activeLabel}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {activeGroup.steps.length} step{activeGroup.steps.length === 1 ? "" : "s"}
                    {activeResolved?.startTimestamp != null
                      ? ` · ${formatTimestampInput(activeResolved.startTimestamp)}`
                      : " · Timestamp missing"}
                  </p>
                  {playingSectionIndex === activeSectionIndex ? (
                    <p className="mt-1 text-xs font-semibold text-olive">Playing</p>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-2">
                    {onSetStartFromPlayhead ? (
                      <button
                        type="button"
                        className={`${adminSecondaryButtonClass} w-full text-xs ${adminFocusRing}`}
                        aria-label={`Set start timestamp for ${activeLabel ?? "section"} to ${formatTimestampInput(playheadRounded)}`}
                        onClick={() =>
                          onSetStartFromPlayhead(activeSectionIndex, playheadRounded)
                        }
                      >
                        Set start from {formatTimestampInput(playheadRounded)}
                      </button>
                    ) : null}
                    {onSetEndFromPlayhead ? (
                      <button
                        type="button"
                        className={`${adminSecondaryButtonClass} w-full text-xs ${adminFocusRing}`}
                        aria-label={`Set explicit end timestamp for ${activeLabel ?? "section"} to ${formatTimestampInput(playheadRounded)}`}
                        onClick={() => onSetEndFromPlayhead(activeSectionIndex, playheadRounded)}
                      >
                        Set end from {formatTimestampInput(playheadRounded)}
                      </button>
                    ) : null}
                    {endPlayheadFeedbackByGroup[activeSectionIndex] ? (
                      <p className="text-xs font-semibold text-terracotta" role="alert">
                        {endPlayheadFeedbackByGroup[activeSectionIndex]}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-4 border-t border-line/70 pt-3 text-xs text-muted">
                  Expand a section or press Play to choose the active section for timestamp actions.
                </p>
              )}
            </>
          ) : null}
        </>
      )}
    </aside>
  );
}
