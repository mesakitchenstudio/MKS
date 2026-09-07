import { youtubeWatchUrl } from "@/lib/youtube";
import { isPublicCatalogueEligible } from "@/lib/public-videos/eligibility";

/**
 * Canonical public discovery path for a Mesa catalogue video.
 * Returns null when the ID is not a plausible YouTube videoId shape.
 * Callers must still enforce catalogue eligibility before linking here.
 */
export function publicMesaWatchPath(videoId: string | null | undefined): string | null {
  const id = String(videoId ?? "").trim();
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) return null;
  return `/videos/${id}`;
}

export type PublicVideoDiscoveryHref = {
  href: string;
  /** True when the destination is YouTube (or other external), not Mesa watch. */
  external: boolean;
};

/**
 * Prefer Mesa `/videos/[videoId]` for catalogue-eligible videos.
 * Fall back to an intentional external YouTube URL when not catalogue-eligible.
 * Never invent a Mesa watch page for arbitrary parsed IDs.
 */
export function resolvePublicVideoDiscoveryHref(input: {
  videoId?: string | null;
  catalogueEligible: boolean;
  /** Prebuilt YouTube URL, or constructed from videoId when omitted. */
  youtubeWatchUrl?: string | null;
}): PublicVideoDiscoveryHref | null {
  if (input.catalogueEligible) {
    const mesa = publicMesaWatchPath(input.videoId);
    // Eligible but invalid ID must not invent a Mesa or YouTube destination.
    if (!mesa) return null;
    return { href: mesa, external: false };
  }

  const direct = String(input.youtubeWatchUrl ?? "").trim();
  if (direct.startsWith("http://") || direct.startsWith("https://")) {
    return { href: direct, external: true };
  }

  const built = youtubeWatchUrl(String(input.videoId ?? "").trim());
  if (built) return { href: built, external: true };

  return null;
}

/** Eligibility helper for surfaces that already hold synced YouTubeVideo fields. */
export function isSyncedVideoCatalogueEligible(input: {
  videoId?: string | null;
  title?: string | null;
  thumbnailUrl?: string | null;
  privacyStatus?: string | null;
}): boolean {
  return isPublicCatalogueEligible(input);
}
