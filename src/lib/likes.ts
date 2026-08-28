export type LikedRecipe = {
  slug: string;
  title: string;
};

import {
  forcePublicSignOut,
  MemberSessionExpiredError,
  readSession,
} from "./auth-client";

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

async function handleUnauthorizedFavoritesResponse(response: Response) {
  if (response.status !== 401) return false;
  await forcePublicSignOut();
  throw new MemberSessionExpiredError();
}

export async function toggleLike(recipe: LikedRecipe) {
  const session = readSession();
  if (!session) {
    throw new MemberSessionExpiredError();
  }

  const response = await fetch("/api/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recipe),
  });
  await handleUnauthorizedFavoritesResponse(response);
  if (!response.ok) {
    throw new Error("Could not save recipe.");
  }
  const data = (await response.json()) as { liked: boolean; favorites: LikedRecipe[] };
  writeLikes(data.favorites);
  return data.liked;
}

export async function removeLike(recipe: LikedRecipe) {
  const session = readSession();
  if (!session) {
    throw new MemberSessionExpiredError();
  }

  const response = await fetch("/api/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...recipe, action: "remove" }),
  });
  await handleUnauthorizedFavoritesResponse(response);
  if (!response.ok) {
    throw new Error("Could not remove saved recipe.");
  }
  const data = (await response.json()) as { favorites: LikedRecipe[] };
  writeLikes(data.favorites ?? []);
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
      if (imported.status === 401) {
        await forcePublicSignOut();
        return [];
      }
      if (imported.ok) {
        const data = (await imported.json()) as { favorites: LikedRecipe[] };
        if (data.favorites?.length) {
          writeLikes(data.favorites);
          return data.favorites;
        }
      }
    }
    const response = await fetch("/api/favorites");
    if (response.status === 401) {
      await forcePublicSignOut();
      return [];
    }
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
