export type LikedRecipe = {
  slug: string;
  title: string;
};

import { readSession } from "./auth-client";

function likesKey() {
  const session = readSession();
  return session ? `mesa-liked-recipes:${session.email}` : "mesa-liked-recipes";
}

export function readLikes(): LikedRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(likesKey());
    return raw ? (JSON.parse(raw) as LikedRecipe[]) : [];
  } catch {
    return [];
  }
}

export function writeLikes(likes: LikedRecipe[]) {
  localStorage.setItem(likesKey(), JSON.stringify(likes));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("mesa-likes-changed"));
  }
}

export function isLiked(slug: string) {
  return readLikes().some((item) => item.slug === slug);
}

export async function toggleLike(recipe: LikedRecipe) {
  const session = readSession();
  if (session) {
    try {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });
      if (response.ok) {
        const data = (await response.json()) as { liked: boolean; favorites: LikedRecipe[] };
        writeLikes(data.favorites);
        return data.liked;
      }
    } catch {
      // Fall through to local save if the profile API is unavailable.
    }
  }
  const current = readLikes();
  const exists = current.some((item) => item.slug === recipe.slug);
  const next = exists
    ? current.filter((item) => item.slug !== recipe.slug)
    : [recipe, ...current];
  writeLikes(next);
  return !exists;
}

export async function removeLike(recipe: LikedRecipe) {
  const session = readSession();
  if (session) {
    try {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...recipe, action: "remove" }),
      });
      if (response.ok) {
        const data = (await response.json()) as { favorites: LikedRecipe[] };
        writeLikes(data.favorites ?? []);
        return;
      }
    } catch {
      // Fall through to local remove.
    }
  }
  writeLikes(readLikes().filter((item) => item.slug !== recipe.slug));
}

export async function hydrateLikesFromProfile() {
  if (!readSession()) return readLikes();
  try {
    const local = readLikes();
    if (local.length) {
      const imported = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ import: local }),
      });
      if (imported.ok) {
        const data = (await imported.json()) as { favorites: LikedRecipe[] };
        if (data.favorites?.length) {
          writeLikes(data.favorites);
          return data.favorites;
        }
      }
    }
    const response = await fetch("/api/favorites");
    if (!response.ok) return readLikes();
    const data = (await response.json()) as { favorites: LikedRecipe[] };
    if (data.favorites?.length) {
      writeLikes(data.favorites);
      return data.favorites;
    }
    return readLikes();
  } catch {
    return readLikes();
  }
}
