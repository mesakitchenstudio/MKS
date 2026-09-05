import { site } from "@/data/site";

/** Brand segment for browser document titles. */
export const PAGE_TITLE_BRAND = site.name;

/** Next.js root `metadata.title.template` value. */
export const PAGE_TITLE_TEMPLATE = `%s | ${PAGE_TITLE_BRAND}`;

/** Default document title when a route does not set its own segment. */
export const PAGE_TITLE_DEFAULT = `Home | ${PAGE_TITLE_BRAND}`;

const BRAND_PIPE_SUFFIX = ` | ${PAGE_TITLE_BRAND}`;

/**
 * Page-name segment for the root title template.
 * Strips a trailing `| Mesa Kitchen Studio` (or a bare brand suffix) so the
 * layout template never doubles the brand.
 */
export function pageTitleSegment(pageName: string): string {
  let name = pageName.trim().replace(/\s+/g, " ");
  if (!name) return "Home";

  while (name.endsWith(BRAND_PIPE_SUFFIX)) {
    name = name.slice(0, -BRAND_PIPE_SUFFIX.length).trim();
  }

  // e.g. "About Mesa Kitchen Studio" → "About"
  if (name.endsWith(` ${PAGE_TITLE_BRAND}`)) {
    name = name.slice(0, -(PAGE_TITLE_BRAND.length + 1)).trim();
  }

  if (!name || name === PAGE_TITLE_BRAND) return "Home";
  return name;
}

/** Absolute document title that bypasses the layout template. */
export function absolutePageTitle(pageName: string): string {
  const segment = pageTitleSegment(pageName);
  return `${segment}${BRAND_PIPE_SUFFIX}`;
}
