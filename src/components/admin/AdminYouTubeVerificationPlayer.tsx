"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { youtubeEmbedUrl } from "@/lib/youtube";
import {
  loadYouTubeIframeApi,
  YT_PLAYER_STATE,
  type YtPlayer,
} from "@/lib/youtube-iframe-api";
import type { InstructionVideoWorkspacePlayer } from "@/lib/instruction-video-workspace";

export type AdminYouTubeVerificationPlayerHandle = InstructionVideoWorkspacePlayer;

type Props = {
  videoId: string;
  title: string;
  onReady?: () => void;
  onError?: (message: string) => void;
  onPlayheadChange?: (seconds: number, duration: number | null) => void;
  pollIntervalMs?: number;
};

export const AdminYouTubeVerificationPlayer = forwardRef<
  AdminYouTubeVerificationPlayerHandle,
  Props
>(function AdminYouTubeVerificationPlayer(
  {
    videoId,
    title,
    onReady,
    onError,
    onPlayheadChange,
    pollIntervalMs = 500,
  },
  ref,
) {
  const reactId = useId();
  const iframeDomId = `mesa-admin-yt-${reactId.replace(/:/g, "")}`;
  const playerRef = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onPlayheadChangeRef = useRef(onPlayheadChange);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onPlayheadChangeRef.current = onPlayheadChange;
  }, [onError, onPlayheadChange, onReady]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds: number, allowSeekAhead = true) {
        playerRef.current?.seekTo?.(seconds, allowSeekAhead);
      },
      playVideo() {
        playerRef.current?.playVideo?.();
      },
      pauseVideo() {
        playerRef.current?.pauseVideo?.();
      },
      getCurrentTime() {
        return playerRef.current?.getCurrentTime?.() ?? 0;
      },
      getDuration() {
        return playerRef.current?.getDuration?.() ?? 0;
      },
      isReady() {
        return readyRef.current;
      },
    }),
    [],
  );

  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const embed = youtubeEmbedUrl(videoId, {
    autoplay: false,
    enableApi: true,
    origin,
  });

  useEffect(() => {
    if (!embed) return;
    let cancelled = false;
    readyRef.current = false;

    void loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled) return;

        const mount = () => {
          const el = document.getElementById(iframeDomId);
          if (!el) return;

          try {
            playerRef.current?.destroy?.();
          } catch {
            /* ignore */
          }

          playerRef.current = new YT.Player(iframeDomId, {
            events: {
              onReady: () => {
                if (cancelled) return;
                readyRef.current = true;
                onReadyRef.current?.();
              },
              onError: () => {
                if (cancelled) return;
                onErrorRef.current?.("Video preview unavailable.");
              },
              onStateChange: (event) => {
                if (cancelled || !onPlayheadChangeRef.current) return;
                const playing =
                  event.data === YT.PlayerState.PLAYING ||
                  event.data === YT_PLAYER_STATE.PLAYING;
                if (playing) {
                  const current = playerRef.current?.getCurrentTime?.() ?? 0;
                  const duration = playerRef.current?.getDuration?.() ?? null;
                  onPlayheadChangeRef.current(current, duration && duration > 0 ? duration : null);
                }
              },
            },
          });
        };

        if (document.getElementById(iframeDomId)) {
          mount();
        } else {
          window.requestAnimationFrame(mount);
        }
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current?.("Could not load the YouTube player.");
      });

    return () => {
      cancelled = true;
      readyRef.current = false;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [embed, iframeDomId, videoId]);

  useEffect(() => {
    if (!onPlayheadChange) return;
    const tick = () => {
      if (!readyRef.current || !playerRef.current) return;
      const state = playerRef.current.getPlayerState?.();
      const playing =
        state === YT_PLAYER_STATE.PLAYING || state === YT_PLAYER_STATE.BUFFERING;
      if (!playing) return;
      const current = playerRef.current.getCurrentTime?.() ?? 0;
      const duration = playerRef.current.getDuration?.() ?? null;
      onPlayheadChangeRef.current?.(current, duration && duration > 0 ? duration : null);
    };
    const id = window.setInterval(tick, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [onPlayheadChange, pollIntervalMs, videoId]);

  if (!embed) {
    return (
      <div className="flex aspect-video items-center justify-center bg-cream/40 px-4 text-center text-sm text-muted">
        Invalid video ID.
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-sm border border-line/80 bg-ink/5">
      <iframe
        id={iframeDomId}
        src={embed}
        title={title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
});
