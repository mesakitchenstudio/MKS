"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ResolvedRecipeYoutube } from "@/data/youtube-types";
import type { WatchNextRecommendation } from "@/lib/youtube-data/watch-next-select";
import type { VideoAnalyticsSource } from "@/lib/video-analytics";
import { resetVideoMilestones, trackVideoEvent } from "@/lib/video-analytics";

type RecipeVideoContextValue = {
  youtube: ResolvedRecipeYoutube;
  recipeSlug: string;
  recipeName: string;
  watchNext: WatchNextRecommendation | null;
  active: boolean;
  playing: boolean;
  docked: boolean;
  expanded: boolean;
  videoInteracted: boolean;
  startSeconds: number;
  floatingDismissed: boolean;
  scrollCardVisible: boolean;
  setScrollCardVisible: (value: boolean) => void;
  setDocked: (value: boolean) => void;
  setFloatingDismissed: (value: boolean) => void;
  setExpanded: (value: boolean) => void;
  activate: (options?: { start?: number; source?: VideoAnalyticsSource }) => void;
  expandWatchMethod: (options?: { source?: VideoAnalyticsSource; scroll?: boolean }) => void;
  scrollToVideo: () => void;
  onPlayStart: () => void;
  onCloseFloating: () => void;
  mainAnchorRef: React.RefObject<HTMLDivElement | null>;
};

const RecipeVideoContext = createContext<RecipeVideoContextValue | null>(null);

export function RecipeVideoProvider({
  youtube,
  recipeSlug,
  recipeName,
  watchNext = null,
  children,
}: {
  youtube: ResolvedRecipeYoutube;
  recipeSlug: string;
  recipeName: string;
  watchNext?: WatchNextRecommendation | null;
  children: ReactNode;
}) {
  const mainAnchorRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef(false);
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [docked, setDocked] = useState(true);
  const [startSeconds, setStartSeconds] = useState(0);
  const [floatingDismissed, setFloatingDismissed] = useState(false);
  const [scrollCardVisible, setScrollCardVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [videoInteracted, setVideoInteracted] = useState(false);

  const scrollToVideo = useCallback(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mainAnchorRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  const expandWatchMethod = useCallback(
    (options?: { source?: VideoAnalyticsSource; scroll?: boolean }) => {
      const firstExpand = !expandedRef.current;
      expandedRef.current = true;
      setExpanded(true);
      setVideoInteracted(true);
      if (firstExpand) {
        trackVideoEvent("recipe_video_expand", {
          recipeSlug,
          recipeName,
          videoId: youtube.videoId,
          videoTitle: youtube.title,
          source: options?.source ?? "recipe_top_watch",
        });
      }
      trackVideoEvent("recipe_video_cta_click", {
        recipeSlug,
        recipeName,
        videoId: youtube.videoId,
        videoTitle: youtube.title,
        source: options?.source ?? "recipe_top_watch",
      });
      if (options?.scroll !== false) {
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        mainAnchorRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      }
    },
    [recipeName, recipeSlug, youtube.title, youtube.videoId],
  );

  const activate = useCallback(
    (options?: { start?: number; source?: VideoAnalyticsSource }) => {
      const start = options?.start ?? 0;
      setStartSeconds(start);
      setActive(true);
      setVideoInteracted(true);
      trackVideoEvent("recipe_video_cta_click", {
        recipeSlug,
        recipeName,
        videoId: youtube.videoId,
        videoTitle: youtube.title,
        source: options?.source ?? "main_embed",
        timestamp: start || undefined,
      });
    },
    [recipeName, recipeSlug, youtube.title, youtube.videoId],
  );

  const onPlayStart = useCallback(() => {
    setPlaying(true);
    setDocked(true);
    setVideoInteracted(true);
    resetVideoMilestones(youtube.videoId);
    trackVideoEvent("recipe_video_play", {
      recipeSlug,
      recipeName,
      videoId: youtube.videoId,
      videoTitle: youtube.title,
      source: "main_embed",
    });
  }, [recipeName, recipeSlug, youtube.title, youtube.videoId]);

  const onCloseFloating = useCallback(() => {
    setFloatingDismissed(true);
    setDocked(true);
    trackVideoEvent("recipe_floating_video_close", {
      recipeSlug,
      recipeName,
      videoId: youtube.videoId,
      videoTitle: youtube.title,
      source: playing && !docked ? "floating_player" : "floating_card",
    });
  }, [docked, playing, recipeName, recipeSlug, youtube.title, youtube.videoId]);

  const value = useMemo(
    () => ({
      youtube,
      recipeSlug,
      recipeName,
      watchNext,
      active,
      playing,
      docked,
      expanded,
      videoInteracted,
      startSeconds,
      floatingDismissed,
      scrollCardVisible,
      setScrollCardVisible,
      setDocked,
      setFloatingDismissed,
      setExpanded,
      activate,
      expandWatchMethod,
      scrollToVideo,
      onPlayStart,
      onCloseFloating,
      mainAnchorRef,
    }),
    [
      youtube,
      recipeSlug,
      recipeName,
      watchNext,
      active,
      playing,
      docked,
      expanded,
      videoInteracted,
      startSeconds,
      floatingDismissed,
      scrollCardVisible,
      activate,
      expandWatchMethod,
      scrollToVideo,
      onPlayStart,
      onCloseFloating,
    ],
  );

  return <RecipeVideoContext.Provider value={value}>{children}</RecipeVideoContext.Provider>;
}

export function useRecipeVideo() {
  const ctx = useContext(RecipeVideoContext);
  if (!ctx) throw new Error("useRecipeVideo must be used within RecipeVideoProvider");
  return ctx;
}

export function useRecipeVideoOptional() {
  return useContext(RecipeVideoContext);
}
