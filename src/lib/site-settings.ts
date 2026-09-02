import { getDb } from "@/lib/db";

export const SITE_SETTING_KEYS = {
  homepageFeaturedRecipeSlug: "homepage.featuredRecipeSlug",
  homepageFromKitchenRecipeSlugs: "homepage.fromKitchenRecipeSlugs",
} as const;

export async function getSiteSetting(key: string): Promise<string | null> {
  try {
    const row = await getDb().siteSetting.findUnique({ where: { key } });
    const value = row?.value?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export async function setSiteSetting(key: string, value: string) {
  await getDb().siteSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getHomepageFeaturedRecipeSlug(): Promise<string | null> {
  return getSiteSetting(SITE_SETTING_KEYS.homepageFeaturedRecipeSlug);
}

export function parseHomepageFromKitchenSlugs(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((slug) => String(slug ?? "").trim())
        .filter(Boolean)
        .slice(0, 3);
    }
  } catch {
    // fall through to comma-separated
  }
  return raw
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function getHomepageFromKitchenRecipeSlugs(): Promise<string[]> {
  const raw = await getSiteSetting(SITE_SETTING_KEYS.homepageFromKitchenRecipeSlugs);
  return parseHomepageFromKitchenSlugs(raw);
}

export function serializeHomepageFromKitchenSlugs(slugs: string[]): string {
  const unique: string[] = [];
  for (const slug of slugs) {
    const trimmed = slug.trim();
    if (!trimmed || unique.includes(trimmed)) continue;
    unique.push(trimmed);
    if (unique.length >= 3) break;
  }
  return JSON.stringify(unique);
}
