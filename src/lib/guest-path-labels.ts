import { shouldTrackGuestPath } from "@/lib/guest-tracking";

const STATIC_TITLES: Record<string, string> = {
  "/": "Home",
  "/coming-soon": "Coming Soon",
  "/recipes": "Recipes",
  "/videos": "Videos",
  "/studio": "Studio",
  "/about": "About",
  "/privacy": "Privacy",
  "/contact": "Contact",
  "/disclosures": "Disclosures",
  "/search": "Search",
  "/series": "Cooking Series",
  "/auth/error": "Error",
};

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Paths that should never appear in Popular pages. */
export function isPopularGuestPath(path: string) {
  if (!shouldTrackGuestPath(path)) return false;
  if (path.startsWith("/_next")) return false;
  if (path === "/health" || path === "/ready" || path === "/status") return false;
  return true;
}

/** Editorial Popular content ranking — excludes Coming Soon operational traffic. */
export function isEditorialPopularGuestPath(path: string) {
  if (!isPopularGuestPath(path)) return false;
  if (path === "/coming-soon") return false;
  return true;
}

export function isComingSoonGuestPath(path: string) {
  return path.trim() === "/coming-soon";
}

/** Individual recipe pages (`/recipes/[slug]`), not the catalogue index. */
export function isRecipeDetailGuestPath(path: string) {
  return /^\/recipes\/[^/]+\/?$/.test(path.trim());
}

export function guestPathTitle(path: string, recipeTitles?: Map<string, string>) {
  const clean = path.trim() || "/";
  if (STATIC_TITLES[clean]) return STATIC_TITLES[clean];

  const recipeMatch = clean.match(/^\/recipes\/([^/]+)\/?$/);
  if (recipeMatch?.[1]) {
    return recipeTitles?.get(recipeMatch[1]) || humanizeSlug(recipeMatch[1]);
  }

  const categoryMatch = clean.match(/^\/category\/([^/]+)\/?$/);
  if (categoryMatch?.[1]) {
    return humanizeSlug(categoryMatch[1]);
  }

  const seriesMatch = clean.match(/^\/series\/([^/]+)\/?$/);
  if (seriesMatch?.[1]) {
    return humanizeSlug(seriesMatch[1]);
  }

  const studioMatch = clean.match(/^\/studio\/([^/]+)\/?$/);
  if (studioMatch?.[1]) {
    return humanizeSlug(studioMatch[1]);
  }

  if (clean.length > 1) {
    const segments = clean.replace(/\/$/, "").split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) return humanizeSlug(last);
  }

  return clean;
}
