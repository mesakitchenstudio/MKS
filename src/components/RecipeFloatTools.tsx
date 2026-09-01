"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut as signOutGoogle } from "next-auth/react";
import { clearMemberPresenceOnLogout, readSession, signOut } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import { shouldShowFloatingRecipeSearch } from "@/lib/public-search-ui";
import { isLiked, readLikes, toggleLike, hydrateLikesFromProfile, type LikedRecipe } from "@/lib/likes";
import { MemberSessionExpiredError } from "@/lib/auth-client";
import { AuthModal } from "./AuthModal";
import { SearchOverlay, type OverlayRecipe } from "./SearchOverlay";

export function SetCurrentRecipe({ slug, title }: { slug: string; title: string }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("mesa-current-recipe", { detail: { slug, title } }));
  }, [slug, title]);
  return null;
}

export function RecipeFloatTools({ recipes = [] }: { recipes?: OverlayRecipe[] }) {
  const pathname = usePathname();
  const isRecipeDetail = /^\/recipes\/[^/]+$/.test(pathname);
  const [showFloatingSearch, setShowFloatingSearch] = useState(false);

  useEffect(() => {
    function update() {
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      setShowFloatingSearch(
        shouldShowFloatingRecipeSearch({ isRecipeDetail, isDesktop: desktop }),
      );
    }
    update();
    const mq = window.matchMedia("(min-width: 768px)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [isRecipeDetail]);
  const [current, setCurrent] = useState<LikedRecipe | null>(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState<LikedRecipe[]>([]);
  const [panel, setPanel] = useState<"search" | "likes" | "auth" | null>(null);
  const [pendingLike, setPendingLike] = useState(false);
  const [sessionTick, setSessionTick] = useState(0);

  useEffect(() => {
    function onCurrent(event: Event) {
      const detail = (event as CustomEvent<LikedRecipe | null>).detail;
      if (!detail?.slug) {
        setCurrent(null);
        setLiked(false);
        return;
      }
      setCurrent(detail);
      setLiked(isLiked(detail.slug));
    }
    function onNeedAuth() {
      setPendingLike(true);
      setPanel("auth");
    }
    function onOpenAuth() {
      setPendingLike(false);
      setPanel("auth");
    }
    function onSessionChanged() {
      setSessionTick((value) => value + 1);
      setLikes(readLikes());
      setCurrent((recipe) => {
        setLiked(recipe ? isLiked(recipe.slug) : false);
        return recipe;
      });
    }
    function onLikesChanged() {
      setLikes(readLikes());
      setCurrent((recipe) => {
        setLiked(recipe ? isLiked(recipe.slug) : false);
        return recipe;
      });
    }
    window.addEventListener("mesa-current-recipe", onCurrent);
    window.addEventListener("mesa-need-auth", onNeedAuth);
    window.addEventListener("mesa-open-auth", onOpenAuth);
    window.addEventListener("mesa-session-changed", onSessionChanged);
    window.addEventListener("mesa-likes-changed", onLikesChanged);
    return () => {
      window.removeEventListener("mesa-current-recipe", onCurrent);
      window.removeEventListener("mesa-need-auth", onNeedAuth);
      window.removeEventListener("mesa-open-auth", onOpenAuth);
      window.removeEventListener("mesa-session-changed", onSessionChanged);
      window.removeEventListener("mesa-likes-changed", onLikesChanged);
    };
  }, []);

  useEffect(() => {
    const match = pathname.match(/^\/recipes\/([^/]+)$/);
    if (match) {
      const slug = decodeURIComponent(match[1]);
      const recipe = recipes.find((item) => item.slug === slug);
      setCurrent({ slug, title: recipe?.title ?? slug });
      setLiked(isLiked(slug));
    } else {
      setCurrent(null);
      setLiked(false);
    }
    setLikes(readLikes());
  }, [pathname, recipes]);

  useEffect(() => {
    if (!readSession() || !current) return;
    if (sessionStorage.getItem("mesa-pending-like") !== "1") return;
    sessionStorage.removeItem("mesa-pending-like");
    void applyLike();
  }, [current, pathname, sessionTick]);

  async function applyLike() {
    if (!current) return;
    try {
      const nextLiked = await toggleLike(current);
      setLiked(nextLiked);
      trackEvent("recipe_favorite", {
        recipe_slug: current.slug,
        recipe_title: current.title,
        source: nextLiked ? "add" : "remove",
      });
      setLikes(readLikes());
      setPanel("likes");
    } catch (error) {
      setLiked(isLiked(current.slug));
      setLikes(readLikes());
      if (error instanceof MemberSessionExpiredError) {
        setPanel("auth");
        return;
      }
      setPanel(null);
    }
  }

  function onHeart() {
    if (!current) return;
    if (!readSession()) {
      setPendingLike(true);
      setPanel("auth");
      return;
    }
    void applyLike();
  }

  function onSignedIn() {
    setPanel(null);
    void hydrateLikesFromProfile().then(() => {
      setLikes(readLikes());
      if (pendingLike) {
        setPendingLike(false);
        void applyLike();
      }
    });
  }

  // Only a recipe-detail page sets `current` (pathname + SetCurrentRecipe).
  // Do not render a global Favorite control when there is nothing to save.
  const showFavorite = Boolean(current?.slug);
  const showFloatingTools = showFavorite || showFloatingSearch;

  return (
    <div className="no-print">
      {showFloatingTools ? (
      <div className="fixed right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-3 md:right-6">
        {showFavorite ? (
        <button
          type="button"
          aria-label={liked ? "Remove from saved recipes" : "Save recipe"}
          aria-pressed={liked}
          onClick={onHeart}
          className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-md transition-colors ${
            liked
              ? "border-terracotta bg-terracotta"
              : "border-line bg-paper hover:border-terracotta"
          }`}
        >
          <HeartIcon filled={liked} />
        </button>
        ) : null}
        {showFloatingSearch ? (
        <button
          type="button"
          aria-label="Search recipes"
          onClick={() => setPanel((value) => (value === "search" ? null : "search"))}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-olive shadow-md hover:bg-olive-dark"
        >
          <SearchIcon />
        </button>
        ) : null}
      </div>
      ) : null}

      {panel === "auth" ? (
        <AuthModal
          pendingLike={pendingLike}
          onClose={() => setPanel(null)}
          onSignedIn={onSignedIn}
        />
      ) : null}

      {panel === "search" ? (
        <SearchOverlay recipes={recipes} onClose={() => setPanel(null)} />
      ) : null}

      {panel === "likes" ? (
        <div className="fixed inset-0 z-50 bg-ink/40" onClick={() => setPanel(null)}>
          <div
            className="absolute right-20 top-1/2 w-[min(28rem,calc(100vw-7rem))] -translate-y-1/2 border border-line bg-paper p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-serif text-2xl">Saved recipes</p>
              {readSession() ? (
                <div className="flex items-center gap-3">
                  <Link
                    href="/profile"
                    className="text-xs font-semibold text-olive hover:text-olive-dark"
                    onClick={() => setPanel(null)}
                  >
                    View profile
                  </Link>
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted hover:text-terracotta"
                    onClick={() => {
                      void (async () => {
                        await clearMemberPresenceOnLogout();
                        signOut();
                        await signOutGoogle({ redirect: false });
                        setLiked(false);
                        setLikes([]);
                        setPanel(null);
                      })();
                    }}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
            {likes.length ? (
              <ul className="mt-4 space-y-2">
                {likes.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={`/recipes/${item.slug}`}
                      className="text-sm font-semibold hover:text-terracotta"
                      onClick={() => setPanel(null)}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Open a recipe and tap the heart to save it here.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54Z"
        fill={filled ? "#FFFCF7" : "none"}
        stroke={filled ? "#FFFCF7" : "#C45C3E"}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="#FFFCF7" strokeWidth="1.8" />
      <path d="M15 15.5 20 20.5" fill="none" stroke="#FFFCF7" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
