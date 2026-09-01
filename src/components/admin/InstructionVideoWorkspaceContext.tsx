"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { AdminYouTubeVerificationPlayerHandle } from "@/components/admin/AdminYouTubeVerificationPlayer";
import type { InstructionGroupWithChapters } from "@/lib/instruction-chapters";
import {
  findCanonicalSectionAtPlayhead,
  roundPlayheadToSeconds,
  type QueuedSeek,
} from "@/lib/instruction-video-workspace";

export type LinkedVideoPreview = {
  videoId: string;
  title: string;
  durationDisplay: string;
  durationSeconds: number;
  embeddable: boolean;
};

type InstructionVideoWorkspaceContextValue = {
  linkedVideo: LinkedVideoPreview | null;
  videoPanelVisible: boolean;
  setVideoPanelVisible: (visible: boolean) => void;
  playerError: string | null;
  setPlayerError: (message: string | null) => void;
  currentTimeSeconds: number;
  durationSeconds: number | null;
  activeSectionIndex: number | null;
  setActiveSectionIndex: (index: number | null) => void;
  playingSectionIndex: number | null;
  playerRef: RefObject<AdminYouTubeVerificationPlayerHandle | null>;
  stickyTopPx: number;
  seekAndPlay: (seconds: number, sectionIndex?: number) => void;
  seekOnly: (seconds: number, sectionIndex?: number) => void;
  readPlayheadSeconds: () => number;
  onPlayerReady: () => void;
  onPlayheadChange: (seconds: number, duration: number | null) => void;
};

const InstructionVideoWorkspaceContext = createContext<InstructionVideoWorkspaceContextValue | null>(
  null,
);

export function useInstructionVideoWorkspaceOptional() {
  return useContext(InstructionVideoWorkspaceContext);
}

export function useInstructionVideoWorkspace() {
  const ctx = useContext(InstructionVideoWorkspaceContext);
  if (!ctx) {
    throw new Error("useInstructionVideoWorkspace requires InstructionVideoWorkspaceProvider");
  }
  return ctx;
}

export function InstructionVideoWorkspaceProvider({
  linkedVideo,
  instructionGroups,
  videoDurationSeconds,
  stickyTopPx = 96,
  children,
}: {
  linkedVideo: LinkedVideoPreview | null;
  instructionGroups: InstructionGroupWithChapters[];
  videoDurationSeconds?: number;
  stickyTopPx?: number;
  children: ReactNode;
}) {
  const playerRef = useRef<AdminYouTubeVerificationPlayerHandle | null>(null);
  const pendingSeekRef = useRef<QueuedSeek | null>(null);
  const [videoPanelVisible, setVideoPanelVisible] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(
    linkedVideo?.durationSeconds ?? videoDurationSeconds ?? null,
  );
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(null);
  const [playingSectionIndex, setPlayingSectionIndex] = useState<number | null>(null);

  const effectiveDuration =
    durationSeconds ?? linkedVideo?.durationSeconds ?? videoDurationSeconds ?? null;

  const readPlayheadSeconds = useCallback(() => {
    const raw = playerRef.current?.getCurrentTime() ?? currentTimeSeconds;
    return roundPlayheadToSeconds(raw);
  }, [currentTimeSeconds]);

  const runSeek = useCallback((request: QueuedSeek) => {
    const player = playerRef.current;
    if (player?.isReady()) {
      player.seekTo(request.seconds, true);
      if (request.play) player.playVideo();
      pendingSeekRef.current = null;
      if (request.sectionIndex != null) setActiveSectionIndex(request.sectionIndex);
      return;
    }
    pendingSeekRef.current = request;
  }, []);

  const seekAndPlay = useCallback(
    (seconds: number, sectionIndex?: number) => {
      runSeek({
        seconds: roundPlayheadToSeconds(seconds),
        play: true,
        sectionIndex,
      });
    },
    [runSeek],
  );

  const seekOnly = useCallback(
    (seconds: number, sectionIndex?: number) => {
      runSeek({
        seconds: roundPlayheadToSeconds(seconds),
        play: false,
        sectionIndex,
      });
    },
    [runSeek],
  );

  const onPlayerReady = useCallback(() => {
    setPlayerError(null);
    const duration = playerRef.current?.getDuration();
    if (duration && duration > 0) setDurationSeconds(Math.floor(duration));
    const pending = pendingSeekRef.current;
    if (pending) {
      playerRef.current?.seekTo(pending.seconds, true);
      if (pending.play) playerRef.current?.playVideo();
      if (pending.sectionIndex != null) setActiveSectionIndex(pending.sectionIndex);
      pendingSeekRef.current = null;
    }
  }, []);

  const onPlayheadChange = useCallback(
    (seconds: number, duration: number | null) => {
      setCurrentTimeSeconds(seconds);
      if (duration != null && duration > 0) setDurationSeconds(Math.floor(duration));
      const atSection = findCanonicalSectionAtPlayhead({
        groups: instructionGroups,
        playheadSeconds: seconds,
        videoDurationSeconds: effectiveDuration ?? undefined,
      });
      setPlayingSectionIndex(atSection);
    },
    [effectiveDuration, instructionGroups],
  );

  const value = useMemo(
    (): InstructionVideoWorkspaceContextValue => ({
      linkedVideo,
      videoPanelVisible,
      setVideoPanelVisible,
      playerError,
      setPlayerError,
      currentTimeSeconds,
      durationSeconds: effectiveDuration,
      activeSectionIndex,
      setActiveSectionIndex,
      playingSectionIndex,
      playerRef,
      stickyTopPx,
      seekAndPlay,
      seekOnly,
      readPlayheadSeconds,
      onPlayerReady,
      onPlayheadChange,
    }),
    [
      linkedVideo,
      videoPanelVisible,
      playerError,
      currentTimeSeconds,
      effectiveDuration,
      activeSectionIndex,
      playingSectionIndex,
      stickyTopPx,
      seekAndPlay,
      seekOnly,
      readPlayheadSeconds,
      onPlayerReady,
      onPlayheadChange,
    ],
  );

  return (
    <InstructionVideoWorkspaceContext.Provider value={value}>
      {children}
    </InstructionVideoWorkspaceContext.Provider>
  );
}
