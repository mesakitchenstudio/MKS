import { site } from "@/data/site";

export type BreadcrumbJsonLdItem = {
  name: string;
  /** Absolute URL or site-relative path. */
  url: string;
};

/** Absolute public URL on the preferred host (`site.url`). */
export function absolutePublicUrl(pathOrUrl: string): string {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return site.url.replace(/\/$/, "");
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = site.url.replace(/\/$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${path}`;
}

/**
 * schema.org BreadcrumbList for Mesa public pages.
 * Empty/blank entries are dropped; positions start at 1.
 */
export function buildBreadcrumbJsonLd(items: BreadcrumbJsonLdItem[]) {
  const list = items
    .map((item) => ({
      name: String(item.name || "").trim().replace(/\s+/g, " "),
      url: String(item.url || "").trim(),
    }))
    .filter((item) => item.name && item.url);

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: list.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolutePublicUrl(item.url),
    })),
  };
}
