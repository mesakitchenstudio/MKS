import { site } from "@/data/site";
import { pageTitleSegment } from "@/lib/page-title";
import { isCategoryCloneCollection } from "@/lib/series-category-related";

/** Document/social title segment — seoTitle overrides editorial title; H1 stays editorial. */
export function collectionDocumentTitleSegment(input: {
  seoTitle?: string | null;
  title?: string | null;
}): string {
  const seo = String(input.seoTitle ?? "").trim();
  const title = String(input.title ?? "").trim();
  return pageTitleSegment(seo || title || "Collections");
}

/** Meta description — never uses intro. */
export function collectionMetaDescription(input: {
  seoDescription?: string | null;
  description?: string | null;
}): string {
  const seo = String(input.seoDescription ?? "").trim();
  if (seo) return seo;
  const description = String(input.description ?? "").trim();
  if (description) return description;
  return `Cooking collections from ${site.name}.`;
}

export type CategoryCloneIdentity = {
  name: string;
  slug: string;
};

/** True when Collection title/slug merely restates any Category after taxonomy normalization. */
export function collectionMatchesCategoryClone(
  collection: { title: string; slug: string },
  categories: CategoryCloneIdentity[],
): boolean {
  return categories.some((category) => isCategoryCloneCollection(collection, category));
}

export const COLLECTION_CATEGORY_CLONE_WARNING =
  "This Collection closely matches an existing Category. Collections work best when they add a specific editorial angle, such as “French Desserts” or “Easy Desserts for Beginners,” rather than duplicating a broad Category.";
