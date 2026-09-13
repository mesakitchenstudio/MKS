import { canAccess, type AdminArea } from "@/lib/admin-access";
import { ADMIN_DOC_CATEGORY_LABELS, ADMIN_DOC_CATEGORY_ORDER } from "./categories";
import type { AdminDocCategory, AdminDocTopic } from "./types";

/**
 * Access area required to see a documentation topic in the Documentation Center.
 * `"any"` = any authenticated Admin (Profile).
 */
export type AdminDocTopicAccessArea = AdminArea | "any";

/** Canonical topic → AdminArea mapping (mirrors page `requireAccess` / nav areas). */
export const ADMIN_DOC_TOPIC_ACCESS: Record<string, AdminDocTopicAccessArea> = {
  recipes: "content",
  "recipe-editor": "content",
  "recipe-history": "content",
  "content-calendar": "content",
  "content-health": "content",
  "site-health": "content",
  notifications: "content",
  studio: "content",
  media: "content",
  "media-asset": "content",
  categories: "content",
  series: "content",
  "series-editor": "content",
  "series-import": "content",
  "recipe-types": "content",
  "recipe-type-editor": "content",
  redirects: "content",
  reviews: "content",
  "review-detail": "content",
  "content-performance": "content",
  "recipe-performance": "content",
  "search-analytics": "content",
  "search-console": "content",
  members: "members",
  "member-detail": "members",
  newsletter: "members",
  visitors: "members",
  "visitor-detail": "members",
  youtube: "youtube",
  "youtube-video": "youtube",
  "team-access": "staff",
  activity: "staff",
  profile: "any",
};

export type AdminDocPageLink = {
  href: string;
  label: string;
};

/**
 * Safe Admin destinations for “Open page”.
 * Deep/entity topics link to their parent index — never invent `:id` URLs.
 */
export const ADMIN_DOC_TOPIC_PAGE_LINKS: Record<string, AdminDocPageLink> = {
  recipes: { href: "/admin", label: "Open Recipes" },
  "recipe-editor": { href: "/admin", label: "Open Recipes" },
  "recipe-history": { href: "/admin", label: "Open Recipes" },
  "content-calendar": { href: "/admin/content-calendar", label: "Open Content Calendar" },
  "content-health": { href: "/admin/content-health", label: "Open Content Health" },
  "site-health": { href: "/admin/site-health", label: "Open Site Health" },
  notifications: { href: "/admin/notifications", label: "Open Notifications" },
  studio: { href: "/admin/studio", label: "Open Studio" },
  media: { href: "/admin/media", label: "Open Media" },
  "media-asset": { href: "/admin/media", label: "Open Media" },
  categories: { href: "/admin/categories", label: "Open Categories" },
  series: { href: "/admin/series", label: "Open Series" },
  "series-editor": { href: "/admin/series", label: "Open Series" },
  "series-import": { href: "/admin/series/import", label: "Open Series Import" },
  "recipe-types": { href: "/admin/types", label: "Open Recipe Types" },
  "recipe-type-editor": { href: "/admin/types", label: "Open Recipe Types" },
  redirects: { href: "/admin/redirects", label: "Open Redirects" },
  reviews: { href: "/admin/reviews", label: "Open Reviews" },
  "review-detail": { href: "/admin/reviews", label: "Open Reviews" },
  members: { href: "/admin/members", label: "Open Members" },
  "member-detail": { href: "/admin/members", label: "Open Members" },
  newsletter: { href: "/admin/newsletter", label: "Open Newsletter" },
  "content-performance": {
    href: "/admin/content-performance",
    label: "Open Content Performance",
  },
  "recipe-performance": {
    href: "/admin/content-performance",
    label: "Open Content Performance",
  },
  visitors: { href: "/admin/visitors", label: "Open Visitors" },
  "visitor-detail": { href: "/admin/visitors", label: "Open Visitors" },
  "search-analytics": { href: "/admin/search", label: "Open Search" },
  "search-console": { href: "/admin/search-console", label: "Open Search Console" },
  youtube: { href: "/admin/youtube", label: "Open YouTube" },
  "youtube-video": { href: "/admin/youtube", label: "Open YouTube" },
  "team-access": { href: "/admin/staff", label: "Open Team Access" },
  activity: { href: "/admin/activity", label: "Open Activity" },
  profile: { href: "/admin/profile", label: "Open Profile" },
};

export function getAdminDocTopicAccessArea(topicId: string): AdminDocTopicAccessArea | null {
  return ADMIN_DOC_TOPIC_ACCESS[topicId] ?? null;
}

export function canAccessAdminDocTopic(role: string, topicId: string): boolean {
  const area = getAdminDocTopicAccessArea(topicId);
  if (!area) return false;
  if (area === "any") return true;
  return canAccess(role, area);
}

export function filterAdminDocTopicsForRole(
  role: string,
  topics: AdminDocTopic[],
): AdminDocTopic[] {
  return topics.filter((topic) => canAccessAdminDocTopic(role, topic.id));
}

export function getAdminDocPageLink(topicId: string): AdminDocPageLink | null {
  const link = ADMIN_DOC_TOPIC_PAGE_LINKS[topicId];
  if (!link) return null;
  // Guard against accidental dynamic placeholders
  if (link.href.includes(":") || link.href.includes("[")) return null;
  return link;
}

export function groupAdminDocTopicsByCategory(
  topics: AdminDocTopic[],
): Array<{ category: AdminDocCategory; label: string; topics: AdminDocTopic[] }> {
  const byCategory = new Map<AdminDocCategory, AdminDocTopic[]>();
  for (const topic of topics) {
    const list = byCategory.get(topic.category) ?? [];
    list.push(topic);
    byCategory.set(topic.category, list);
  }

  return ADMIN_DOC_CATEGORY_ORDER.filter((category) => (byCategory.get(category)?.length ?? 0) > 0).map(
    (category) => ({
      category,
      label: ADMIN_DOC_CATEGORY_LABELS[category],
      topics: byCategory.get(category) ?? [],
    }),
  );
}

/** Build Documentation Center URL for a topic (or home). */
export function adminDocumentationCenterHref(topicId?: string | null): string {
  const id = String(topicId || "").trim();
  if (!id) return "/admin/documentation";
  return `/admin/documentation?topic=${encodeURIComponent(id)}`;
}
