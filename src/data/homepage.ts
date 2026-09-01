export type HomepageSeasonalWindow = {
  /** MM-DD inclusive start */
  from: string;
  /** MM-DD inclusive end */
  to: string;
};

export type HomepageCollectionConfig = {
  id: string;
  enabled: boolean;
  order: number;
  title: string;
  description?: string;
  viewMoreLabel?: string;
  /** Destination for collection links on /recipes */
  href?: string;
  /** Curated recipe slugs in display order */
  recipeSlugs: string[];
  tone?: "default" | "sand";
  seasonalWindow?: HomepageSeasonalWindow;
};

export type HomepageLatestConfig = {
  enabled: boolean;
  title: string;
  viewMoreLabel?: string;
  href: string;
  limit: number;
};

export type HomepageHeroConfig = {
  /** Legacy file-based fallback when no admin featured recipe is set */
  recipeSlug?: string;
  eyebrow: string;
};

export type HomepageConfig = {
  hero: HomepageHeroConfig;
  latest: HomepageLatestConfig;
  /** Legacy collection definitions for /recipes ?collection= URLs — not rendered on homepage */
  collections: HomepageCollectionConfig[];
};

/** Homepage editorial config — homepage renders hero + latest only. */
export const homepageConfig: HomepageConfig = {
  hero: {
    eyebrow: "From the studio",
  },
  latest: {
    enabled: true,
    title: "Latest recipes",
    viewMoreLabel: "All recipes →",
    href: "/recipes",
    limit: 4,
  },
  collections: [
    {
      id: "summer-at-the-table",
      enabled: false,
      order: 1,
      title: "Summer at the table",
      viewMoreLabel: "View more",
      href: "/recipes?collection=summer-at-the-table",
      recipeSlugs: [
        "peach-skillet-cobbler",
        "lemon-sesame-bars",
        "roasted-market-vegetables",
        "iced-horchata-coffee",
      ],
      tone: "sand",
      seasonalWindow: { from: "05-01", to: "09-30" },
    },
    {
      id: "cookies-and-sweets",
      enabled: false,
      order: 2,
      title: "Cookies and sweets",
      viewMoreLabel: "View more",
      href: "/recipes?collection=cookies-and-sweets",
      recipeSlugs: [
        "chocolate-chunk-cookies",
        "lemon-sesame-bars",
        "vanilla-bean-cupcakes",
        "peach-skillet-cobbler",
      ],
    },
    {
      id: "best-breakfast",
      enabled: false,
      order: 3,
      title: "Best breakfast recipes",
      viewMoreLabel: "View more",
      href: "/recipes?collection=best-breakfast",
      recipeSlugs: [
        "breakfast-tortillas",
        "herb-focaccia",
        "iced-horchata-coffee",
        "citrus-olive-oil-cake",
      ],
    },
    {
      id: "easy-dinners",
      enabled: false,
      order: 4,
      title: "Easy dinner recipes",
      viewMoreLabel: "View more",
      href: "/recipes?collection=easy-dinners",
      recipeSlugs: [
        "weeknight-chile",
        "chile-honey-roasted-chicken",
        "roasted-market-vegetables",
        "herb-focaccia",
      ],
    },
  ],
};

export function homepageCollectionSlugMap(config: HomepageConfig = homepageConfig) {
  const map: Record<string, string[]> = {};
  for (const collection of config.collections) {
    map[collection.id] = collection.recipeSlugs;
  }
  return map;
}

export function homepageCollectionTitles(config: HomepageConfig = homepageConfig) {
  const titles: Record<string, string> = {};
  for (const collection of config.collections) {
    titles[collection.id] = collection.title;
  }
  return titles;
}
