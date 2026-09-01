import {
  hasCanonicalStartTimestamp,
  normalizeInstructionGroups,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";

/** Canonical playhead → stored seconds: nearest whole second. */
export function roundPlayheadToSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.max(0, Math.round(seconds));
}

export type InstructionVideoWorkspacePlayer = {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isReady: () => boolean;
};

export type QueuedSeek = {
  seconds: number;
  play: boolean;
  sectionIndex?: number;
};

export function queueSeekWhenReady(
  player: InstructionVideoWorkspacePlayer | null,
  pending: QueuedSeek | null,
  setPending: (next: QueuedSeek | null) => void,
  request: QueuedSeek,
) {
  if (player?.isReady()) {
    player.seekTo(request.seconds, true);
    if (request.play) player.playVideo();
    else player.pauseVideo();
    setPending(null);
    return;
  }
  setPending(request);
}

export function flushPendingSeek(
  player: InstructionVideoWorkspacePlayer | null,
  pending: QueuedSeek | null,
  setPending: (next: QueuedSeek | null) => void,
) {
  if (!player?.isReady() || !pending) return;
  player.seekTo(pending.seconds, true);
  if (pending.play) player.playVideo();
  setPending(null);
}

/** Which instruction section (canonical mapped only) contains the playhead. */
export function findCanonicalSectionAtPlayhead(input: {
  groups: InstructionGroupWithChapters[];
  playheadSeconds: number;
  videoDurationSeconds?: number;
}): number | null {
  const groups = normalizeInstructionGroups(input.groups);
  const playhead = roundPlayheadToSeconds(input.playheadSeconds);

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    if (!hasCanonicalStartTimestamp(group)) continue;
    const start = group.startTimestamp!;
    let end: number | null = null;
    if (typeof group.endTimestamp === "number" && group.endTimestamp >= 0) {
      end = group.endTimestamp;
    } else {
      for (let nextIndex = index + 1; nextIndex < groups.length; nextIndex += 1) {
        const next = groups[nextIndex]!;
        if (hasCanonicalStartTimestamp(next)) {
          end = next.startTimestamp!;
          break;
        }
      }
      const hasLaterMapped = groups
        .slice(index + 1)
        .some((row) => hasCanonicalStartTimestamp(row));
      if (end == null && !hasLaterMapped && input.videoDurationSeconds != null) {
        end = input.videoDurationSeconds;
      }
    }
    if (playhead < start) continue;
    if (end != null && playhead >= end) continue;
    return index;
  }
  return null;
}

export type ChapterTimestampSuggestion = import("@/lib/ai-recipe/chapter-suggestions/types").ChapterTimestampSuggestionItem;

export function validateEndTimestampFromPlayhead(input: {
  startTimestamp?: number;
  endSeconds: number;
}): { ok: true } | { ok: false; message: string } {
  const end = roundPlayheadToSeconds(input.endSeconds);
  if (input.startTimestamp == null) {
    return { ok: true };
  }
  const start = roundPlayheadToSeconds(input.startTimestamp);
  if (end <= start) {
    return {
      ok: false,
      message: "End must be later than this section's start timestamp.",
    };
  }
  return { ok: true };
}

const END_BEFORE_START_MESSAGE = "End must be later than this section's start timestamp.";

/** Validate an explicitly entered end timestamp (blank/undefined is valid). */
export function validateExplicitEndTimestamp(input: {
  startTimestamp?: number;
  endTimestamp?: number;
}): { ok: true } | { ok: false; message: string } {
  if (input.endTimestamp == null) {
    return { ok: true };
  }
  return validateEndTimestampFromPlayhead({
    startTimestamp: input.startTimestamp,
    endSeconds: input.endTimestamp,
  });
}

export { END_BEFORE_START_MESSAGE };

/** Section-scoped playhead action feedback (keyed by instruction group index). */
export function patchEndPlayheadFeedbackByGroup(
  current: Record<number, string>,
  groupIndex: number,
  message: string | null,
): Record<number, string> {
  const next = { ...current };
  if (message) {
    next[groupIndex] = message;
  } else {
    delete next[groupIndex];
  }
  return next;
}
