import { isSitePrivate } from "@/lib/flags";

/**
 * Central advertising policy for Mesa Kitchen Studio.
 * Ads stay off until ADS_ENABLED=true and a real publisher client is configured.
 */

export const AD_PLACEMENTS = [
  "recipe_catalog_side_rail",
  "recipe_detail_side_rail",
  "recipe_detail_mid",
  "recipe_detail_after_recipe",
] as const;

export type AdPlacementId = (typeof AD_PLACEMENTS)[number];

export type AdsPageKind =
  | "home"
  | "recipe_catalog"
  | "recipe_detail"
  | "studio"
  | "series"
  | "about"
  | "contact"
  | "legal"
  | "auth_member"
  | "admin"
  | "coming_soon"
  | "videos"
  | "other";

export type AdsPagePolicy = {
  /** Page may host ads when globally enabled. */
  eligible: boolean;
  /** Placements allowed on this page kind. */
  placements: readonly AdPlacementId[];
};

/** Reserved size metadata for future CLS control — applied only when ads render. */
export type AdPlacementMeta = {
  id: AdPlacementId;
  /** Future reserved class when ADS_ENABLED (unused while disabled). */
  reservedClassName: string;
  description: string;
};

export const AD_PLACEMENT_META: Record<AdPlacementId, AdPlacementMeta> = {
  recipe_catalog_side_rail: {
    id: "recipe_catalog_side_rail",
    reservedClassName: "min-h-[250px] w-[160px]",
    description: "Future widescreen side rail beside /recipes (not in-grid).",
  },
  recipe_detail_side_rail: {
    id: "recipe_detail_side_rail",
    reservedClassName: "min-h-[250px] w-[160px]",
    description: "Future widescreen side rail beside recipe detail.",
  },
  recipe_detail_mid: {
    id: "recipe_detail_mid",
    reservedClassName: "min-h-[90px] w-full max-w-[728px]",
    description: "In-content slot after cooking workspace (ingredients + method).",
  },
  recipe_detail_after_recipe: {
    id: "recipe_detail_after_recipe",
    reservedClassName: "min-h-[90px] w-full max-w-[728px]",
    description: "In-content slot after recipe body, before related recipes.",
  },
};

const PAGE_POLICIES: Record<AdsPageKind, AdsPagePolicy> = {
  home: { eligible: false, placements: [] },
  recipe_catalog: {
    eligible: true,
    placements: ["recipe_catalog_side_rail"],
  },
  recipe_detail: {
    eligible: true,
    placements: ["recipe_detail_side_rail", "recipe_detail_mid", "recipe_detail_after_recipe"],
  },
  studio: { eligible: false, placements: [] },
  series: { eligible: false, placements: [] },
  about: { eligible: false, placements: [] },
  contact: { eligible: false, placements: [] },
  legal: { eligible: false, placements: [] },
  auth_member: { eligible: false, placements: [] },
  admin: { eligible: false, placements: [] },
  coming_soon: { eligible: false, placements: [] },
  videos: { eligible: false, placements: [] },
  other: { eligible: false, placements: [] },
};

/** Global kill switch. Never treat unset as enabled. */
export function isAdsGloballyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ADS_ENABLED === "true";
}

/** Future publisher id — must be real ca-pub-… before live ads. */
export function getAdSenseClientId(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw =
    env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim() || env.ADSENSE_CLIENT?.trim() || "";
  if (!raw || raw.includes("…") || raw.includes("placeholder") || raw.includes("XXXX")) {
    return null;
  }
  if (!/^ca-pub-\d+$/.test(raw)) return null;
  return raw;
}

export function normalizeAdsPathname(pathname: string): string {
  if (!pathname) return "/";
  const bare = pathname.split("?")[0]?.split("#")[0] || "/";
  if (bare.length > 1 && bare.endsWith("/")) return bare.slice(0, -1);
  return bare || "/";
}

export function resolveAdsPageKind(pathname: string): AdsPageKind {
  const path = normalizeAdsPathname(pathname);

  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  if (path === "/coming-soon") return "coming_soon";
  if (path === "/") return "home";
  if (path === "/recipes") return "recipe_catalog";
  if (/^\/recipes\/[^/]+$/.test(path)) return "recipe_detail";
  if (path === "/studio" || path.startsWith("/studio/")) return "studio";
  if (path === "/series" || path.startsWith("/series/")) return "series";
  if (path === "/about") return "about";
  if (path === "/contact") return "contact";
  if (path === "/privacy" || path === "/disclosures") return "legal";
  if (
    path === "/profile" ||
    path === "/forgot-password" ||
    path === "/reset-password" ||
    path === "/auth/error" ||
    path.startsWith("/auth/")
  ) {
    return "auth_member";
  }
  if (path === "/videos" || path.startsWith("/videos/")) return "videos";
  if (path === "/category" || path.startsWith("/category/")) return "other";
  if (path === "/search") return "other";

  return "other";
}

export function getAdsPagePolicy(pathname: string): AdsPagePolicy {
  return PAGE_POLICIES[resolveAdsPageKind(pathname)];
}

export type AdsAllowanceInput = {
  pathname: string;
  /** When true (Coming Soon / private gate), ads never load. */
  sitePrivate?: boolean;
  env?: NodeJS.ProcessEnv;
};

/**
 * Page-level eligibility: global switch ∧ not private ∧ page policy.
 * Does not by itself render a placement.
 */
export function isAdsAllowedForPath(input: AdsAllowanceInput): boolean {
  const env = input.env ?? process.env;
  if (!isAdsGloballyEnabled(env)) return false;
  const sitePrivate = input.sitePrivate ?? isSitePrivate();
  if (sitePrivate) return false;
  return getAdsPagePolicy(input.pathname).eligible;
}

export function getAllowedAdPlacements(input: AdsAllowanceInput): AdPlacementId[] {
  if (!isAdsAllowedForPath(input)) return [];
  return [...getAdsPagePolicy(input.pathname).placements];
}

export function isAdPlacementAllowed(
  input: AdsAllowanceInput & { placement: AdPlacementId },
): boolean {
  return getAllowedAdPlacements(input).includes(input.placement);
}

/** Whether the AdSense bootstrap script may load on this request/path. */
export function shouldLoadAdSenseScript(input: AdsAllowanceInput): boolean {
  if (!isAdsAllowedForPath(input)) return false;
  return Boolean(getAdSenseClientId(input.env));
}
