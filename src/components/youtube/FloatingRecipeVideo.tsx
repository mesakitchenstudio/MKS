"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackVideoEvent } from "@/lib/video-analytics";
import { useRecipeVideo } from "./RecipeVideoContext";

const SCROLL_SHOW_RATIO = 0.5;
const AUTO_HIDE_MS = 60_000;

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
  const autoHideTimer = useRef<number | null>(null);
  const [scrollCardExpired, setScrollCardExpired] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [allowPrePlayCard, setAllowPrePlayCard] = useState(false);
  const [recipeCardPassed, setRecipeCardPassed] = useState(false);
  const [mainVideoVisible, setMainVideoVisible] = useState(false);

  useEffect(() => {
    const mainVideo = document.getElementById("watch-method");
    if (!mainVideo) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setMainVideoVisible(entry.isIntersecting && entry.intersectionRatio > 0.2);
      },
      { threshold: [0, 0.2, 0.4] },
    );
    observer.observe(mainVideo);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const recipeCard = document.getElementById("recipe-cooking");
    if (!recipeCard) {
      setRecipeCardPassed(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
          setRecipeCardPassed(true);
        }
      },
      { threshold: 0 },
    );
    observer.observe(recipeCard);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setAllowPrePlayCard(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const expireScrollCard = useCallback(() => {
    setScrollCardExpired(true);
    setScrollCardVisible(false);
  }, [setScrollCardVisible]);

  useEffect(() => {
    function onScroll() {
      if (floatingDismissed || scrollCardExpired || playing) return;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const ratio = window.scrollY / max;
      if (ratio >= SCROLL_SHOW_RATIO) {
        setScrollCardVisible(true);
        if (!impressionSent.current) {
          impressionSent.current = true;
          trackVideoEvent("recipe_floating_video_impression", {
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
  }, [
    floatingDismissed,
    playing,
    recipeName,
    recipeSlug,
    scrollCardExpired,
    setScrollCardVisible,
    youtube.title,
    youtube.videoId,
  ]);

  useEffect(() => {
    if (!scrollCardVisible || playing || floatingDismissed || scrollCardExpired) return;
    autoHideTimer.current = window.setTimeout(expireScrollCard, AUTO_HIDE_MS);
    return () => {
      if (autoHideTimer.current) window.clearTimeout(autoHideTimer.current);
    };
  }, [expireScrollCard, scrollCardVisible, playing, floatingDismissed, scrollCardExpired]);

  useEffect(() => {
    const comments = document.getElementById("recipe-comments");
    const footer = document.querySelector("footer");
    const observers: IntersectionObserver[] = [];

    if (comments) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) expireScrollCard();
        },
        { threshold: 0.08 },
      );
      observer.observe(comments);
      observers.push(observer);
    }

    if (footer) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          const visible = entry.isIntersecting;
          setFooterVisible(visible);
          if (visible) {
            expireScrollCard();
            if (playing) setDocked(true);
          }
        },
        { threshold: 0.05 },
      );
      observer.observe(footer);
      observers.push(observer);
    }

    return () => observers.forEach((observer) => observer.disconnect());
  }, [expireScrollCard, playing, setDocked]);

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

  const showScrollCard =
    allowPrePlayCard &&
    recipeCardPassed &&
    !mainVideoVisible &&
    scrollCardVisible &&
    !scrollCardExpired &&
    !playing &&
    !floatingDismissed &&
    !footerVisible;
  const showMiniChrome = playing && !docked && !floatingDismissed && !footerVisible;

  if (!showScrollCard && !showMiniChrome) return null;

  if (showScrollCard) {
    return (
      <ScrollCard
        recipeName={recipeName}
        youtube={youtube}
        onClose={onCloseFloating}
        onPlay={() => {
          trackVideoEvent("recipe_floating_video_play", {
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
      className="no-print fixed bottom-20 right-4 z-[45] w-[min(100vw-2rem,13rem)] sm:bottom-24 sm:right-6 sm:w-[14rem]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <button
        type="button"
        aria-label="Close video suggestion"
        onClick={onClose}
        className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-paper text-xs font-semibold text-ink shadow-md hover:bg-cream"
      >
        ×
      </button>
      <button
        type="button"
        onClick={onPlay}
        className="w-full overflow-hidden rounded-lg border border-line bg-paper text-left shadow-[0_12px_32px_rgba(42,34,24,0.14)] transition hover:border-terracotta/40"
      >
        <p className="bg-sand px-2.5 py-1 text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-olive">
          Watch this recipe
        </p>
        <div className="relative aspect-video bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={youtube.thumbnail}
            alt={`Video thumbnail: ${youtube.title}`}
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-ink/20">
            <span className="rounded-full bg-paper/95 px-2 py-1 text-[0.65rem] font-semibold text-terracotta">
              ▶ Play
            </span>
          </span>
        </div>
        <div className="px-2.5 py-2">
          <p className="line-clamp-2 text-xs font-semibold leading-snug text-ink">{recipeName}</p>
          {youtube.duration ? <p className="mt-0.5 text-[0.65rem] text-muted">{youtube.duration}</p> : null}
        </div>
      </button>
    </div>
  );
}
