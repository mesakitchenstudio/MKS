"use client";

import { useEffect, useRef } from "react";
import { trackVideoEvent } from "@/lib/video-analytics";
import { useRecipeVideo } from "./RecipeVideoContext";

const SCROLL_SHOW_RATIO = 0.35;

export function FloatingRecipeVideo() {
  const {
    youtube,
    recipeSlug,
    recipeName,
    playing,
    docked,
    floatingDismissed,
    scrollCardVisible,
    setScrollCardVisible,
    setDocked,
    activate,
    scrollToVideo,
    onCloseFloating,
    mainAnchorRef,
  } = useRecipeVideo();

  const impressionSent = useRef(false);

  useEffect(() => {
    function onScroll() {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const ratio = window.scrollY / max;
      if (ratio >= SCROLL_SHOW_RATIO && !floatingDismissed) {
        setScrollCardVisible(true);
        if (!impressionSent.current) {
          impressionSent.current = true;
          trackVideoEvent("floating_video_impression", {
            recipeSlug,
            recipeName,
            videoId: youtube.videoId,
            videoTitle: youtube.title,
            source: "floating_card",
          });
        }
      }
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [floatingDismissed, recipeName, recipeSlug, setScrollCardVisible, youtube.title, youtube.videoId]);

  useEffect(() => {
    if (!playing || !mainAnchorRef.current) {
      setDocked(true);
      return;
    }
    const node = mainAnchorRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setDocked(entry.isIntersecting && entry.intersectionRatio > 0.35);
      },
      { threshold: [0, 0.35, 0.6] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mainAnchorRef, playing, setDocked]);

  const showScrollCard = scrollCardVisible && !playing && !floatingDismissed;
  const showMiniChrome = playing && !docked && !floatingDismissed;

  if (!showScrollCard && !showMiniChrome) return null;

  if (showScrollCard) {
    return (
      <ScrollCard
        recipeName={recipeName}
        youtube={youtube}
        onClose={onCloseFloating}
        onPlay={() => {
          trackVideoEvent("floating_video_play", {
            recipeSlug,
            recipeName,
            videoId: youtube.videoId,
            videoTitle: youtube.title,
            source: "floating_card",
          });
          activate({ source: "floating_card" });
          scrollToVideo();
        }}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label="Close mini player"
      onClick={onCloseFloating}
      className="no-print fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-[46] flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-sm font-semibold text-ink shadow-md hover:bg-cream sm:bottom-[calc(6.5rem+env(safe-area-inset-bottom))] sm:right-6"
    >
      ×
    </button>
  );
}

function ScrollCard({
  recipeName,
  youtube,
  onClose,
  onPlay,
}: {
  recipeName: string;
  youtube: { thumbnail: string; duration?: string; videoId: string; title: string };
  onClose: () => void;
  onPlay: () => void;
}) {
  return (
    <div
      className="no-print fixed bottom-20 right-4 z-[45] w-[min(100vw-2rem,16rem)] sm:bottom-24 sm:right-6 sm:w-[17.5rem]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <button
        type="button"
        aria-label="Close video suggestion"
        onClick={onClose}
        className="absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-sm font-semibold text-ink shadow-md hover:bg-cream"
      >
        ×
      </button>
      <button
        type="button"
        onClick={onPlay}
        className="w-full overflow-hidden rounded-xl border border-line bg-paper text-left shadow-[0_16px_40px_rgba(42,34,24,0.18)] transition hover:border-terracotta/40"
      >
        <p className="bg-sand px-3 py-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-olive">
          Watch this recipe
        </p>
        <div className="relative aspect-video bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={youtube.thumbnail}
            alt={`Video thumbnail: ${youtube.title}`}
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-ink/25">
            <span className="rounded-full bg-paper/95 px-3 py-1.5 text-xs font-semibold text-terracotta">
              ▶ Play video
            </span>
          </span>
        </div>
        <div className="px-3 py-2.5">
          <p className="line-clamp-2 text-sm font-semibold text-ink">{recipeName}</p>
          {youtube.duration ? <p className="mt-0.5 text-xs text-muted">{youtube.duration}</p> : null}
        </div>
      </button>
    </div>
  );
}
