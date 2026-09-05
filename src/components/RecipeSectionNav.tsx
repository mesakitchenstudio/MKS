"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { recipeContentShellClass } from "@/components/RecipeContentShell";
import {
  RECIPE_SECTION_NAV_LINKS,
  measureRecipeSectionTriggerY,
  recipeSectionScanlineRootMargin,
  resolveActiveRecipeSectionId,
} from "@/lib/recipe-section-nav";

export function RecipeSectionNav({ hasVideo, hasLearn }: { hasVideo: boolean; hasLearn: boolean }) {
  const items = useMemo(
    () =>
      RECIPE_SECTION_NAV_LINKS.filter((link) => {
        if (link.id === "watch-method" && !hasVideo) return false;
        if (link.id === "recipe-learn" && !hasLearn) return false;
        return true;
      }),
    [hasLearn, hasVideo],
  );

  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [pinned, setPinned] = useState(false);
  const [headerOffset, setHeaderOffset] = useState(72);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const pinnedRef = useRef(false);
  const headerOffsetRef = useRef(72);

  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  useEffect(() => {
    headerOffsetRef.current = headerOffset;
  }, [headerOffset]);

  useEffect(() => {
    const header = document.querySelector(".site-header");
    if (!(header instanceof HTMLElement)) return;

    const syncHeader = () => {
      const next = Math.round(header.getBoundingClientRect().height) || 72;
      headerOffsetRef.current = next;
      setHeaderOffset(next);
    };

    syncHeader();
    const observer = new ResizeObserver(syncHeader);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length) return;

    let frame = 0;
    let observer: IntersectionObserver | null = null;

    const readSectionTops = (): { id: string; top: number }[] => {
      const tops: { id: string; top: number }[] = [];
      for (const item of items) {
        const element = document.getElementById(item.id);
        if (!element) continue;
        tops.push({ id: item.id, top: element.getBoundingClientRect().top });
      }
      return tops;
    };

    const triggerY = () =>
      measureRecipeSectionTriggerY({
        headerHeight: headerOffsetRef.current,
        navHeight: navRef.current?.offsetHeight ?? 44,
        pinned: pinnedRef.current,
      });

    const updateActive = () => {
      frame = 0;
      const next = resolveActiveRecipeSectionId(readSectionTops(), triggerY());
      if (next) setActiveId(next);
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActive);
    };

    const connectObserver = () => {
      observer?.disconnect();
      const offset = triggerY();
      observer = new IntersectionObserver(scheduleUpdate, {
        root: null,
        rootMargin: recipeSectionScanlineRootMargin(offset, window.innerHeight),
        threshold: 0,
      });
      elements.forEach((element) => observer?.observe(element));
      scheduleUpdate();
    };

    connectObserver();

    const onResize = () => connectObserver();
    window.addEventListener("resize", onResize);

    const onHashChange = () => {
      const hashId = window.location.hash.replace(/^#/, "");
      if (items.some((item) => item.id === hashId)) {
        setActiveId(hashId);
        scheduleUpdate();
      }
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [items, pinned, headerOffset]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextPinned = !entry.isIntersecting;
        setPinned(nextPinned);
        document.documentElement.dataset.mesaRecipeCompact = nextPinned ? "true" : "false";
      },
      { threshold: 0, rootMargin: "-1px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      delete document.documentElement.dataset.mesaRecipeCompact;
    };
  }, [items.length]);

  if (items.length < 3) return null;

  return (
    <>
      <div ref={sentinelRef} className="no-print h-px w-full" aria-hidden />
      <nav
        ref={navRef}
        aria-label="Recipe sections"
        style={{ top: pinned ? 0 : headerOffset }}
        className="no-print sticky z-40 border-b border-line/70 bg-[var(--cream)]/95 py-2 backdrop-blur-sm transition-[top]"
      >
        <ul className={`flex flex-wrap gap-x-4 gap-y-1 text-sm ${recipeContentShellClass}`}>
          {items.map((item) => {
            const active = activeId === item.id;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={active ? "true" : undefined}
                  onClick={() => setActiveId(item.id)}
                  className={`inline-flex min-h-11 items-center font-semibold transition-colors hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta ${
                    active ? "text-terracotta" : "text-muted"
                  }`}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
