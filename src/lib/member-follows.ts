/**
 * Roadmap #8 — Follow Topics/Series domain (pure helpers + types).
 * Persistence lives in member-follows-server.ts (trusted userId composition).
 * Public server actions (Phase 8C) must derive userId from auth session — never client.
 */

import { isMemberFollowsEnabled } from "@/lib/flags";

export { isMemberFollowsEnabled };

/** Category.group values eligible as Follow “Topics” in MVP. */
export const FOLLOWABLE_CATEGORY_GROUPS = ["course", "desserts", "holiday"] as const;
export type FollowableCategoryGroup = (typeof FOLLOWABLE_CATEGORY_GROUPS)[number];

export function isFollowableCategoryGroup(
  group: string | null | undefined,
): group is FollowableCategoryGroup {
  if (typeof group !== "string") return false;
  const normalized = group.trim().toLowerCase();
  return (FOLLOWABLE_CATEGORY_GROUPS as readonly string[]).includes(normalized);
}

export type FollowTarget =
  | { type: "series"; id: string }
  | { type: "category"; id: string };

export function isFollowTarget(value: unknown): value is FollowTarget {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return false;
  return record.type === "series" || record.type === "category";
}

export const MEMBER_FOLLOW_ERRORS = [
  "FEATURE_DISABLED",
  "NOT_AUTHENTICATED",
  "TARGET_NOT_FOUND",
  "TARGET_NOT_FOLLOWABLE",
  "INVALID_TARGET",
] as const;

export type MemberFollowError = (typeof MEMBER_FOLLOW_ERRORS)[number];

export type MemberFollowActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: MemberFollowError; message: string };

export function memberFollowErrorMessage(error: MemberFollowError): string {
  switch (error) {
    case "FEATURE_DISABLED":
      return "Following is not available.";
    case "NOT_AUTHENTICATED":
      return "Sign in to follow.";
    case "TARGET_NOT_FOUND":
      return "That collection or topic could not be found.";
    case "TARGET_NOT_FOLLOWABLE":
      return "That topic cannot be followed.";
    case "INVALID_TARGET":
      return "Invalid follow target.";
    default:
      return "Something went wrong.";
  }
}

/** Presentation-safe Following list row (future /profile/following). */
export type MemberFollowListItem =
  | {
      type: "series";
      id: string;
      name: string;
      slug: string;
      followedAt: string;
      isPublished: boolean;
    }
  | {
      type: "category";
      id: string;
      name: string;
      slug: string;
      group: string;
      followedAt: string;
    };

export type MemberFollowList = {
  series: Extract<MemberFollowListItem, { type: "series" }>[];
  categories: Extract<MemberFollowListItem, { type: "category" }>[];
};
