import { getDb } from "@/lib/db";

export const SITE_SETTING_KEYS = {
  homepageFeaturedRecipeSlug: "homepage.featuredRecipeSlug",
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
