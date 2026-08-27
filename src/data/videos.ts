export type VideoItem = {
  id: string;
  title: string;
  category: string;
  thumbnail?: string;
  youtubeUrl?: string;
  youtubeId?: string;
  recipeSlug?: string;
  duration?: string;
  description?: string;
  featured?: boolean;
};

export type VideoPageSectionConfig = {
  id: string;
  title: string;
  videoIds: string[];
};

/** Editorial catalog — sections reference IDs; recipes supply imagery and optional YouTube data. */
export const VIDEO_CATALOG: Record<string, VideoItem> = {
  "salsa-verde-technique": {
    id: "salsa-verde-technique",
    title: "Salsa verde technique",
    category: "Mexican",
    recipeSlug: "salsa-verde",
  },
  "weeknight-chile-walkthrough": {
    id: "weeknight-chile-walkthrough",
    title: "Weeknight dinner walkthrough",
    category: "Main",
    recipeSlug: "weeknight-chile",
  },
  "chocolate-chunk-cookies": {
    id: "chocolate-chunk-cookies",
    title: "Chocolate chunk cookies",
    category: "Dessert",
    recipeSlug: "chocolate-chunk-cookies",
  },
  "skillet-supper": {
    id: "skillet-supper",
    title: "30-minute skillet supper",
    category: "Main",
  },
  "one-pan-chicken": {
    id: "one-pan-chicken",
    title: "One-pan chicken",
    category: "Main",
    recipeSlug: "chile-honey-roasted-chicken",
  },
  "taco-night": {
    id: "taco-night",
    title: "Taco night",
    category: "Main",
  },
  "fresh-pico-de-gallo": {
    id: "fresh-pico-de-gallo",
    title: "Fresh pico de gallo",
    category: "Mexican",
  },
  "homemade-tortillas": {
    id: "homemade-tortillas",
    title: "Homemade tortillas",
    category: "Mexican",
    recipeSlug: "breakfast-tortillas",
  },
  "vanilla-bean-cupcakes": {
    id: "vanilla-bean-cupcakes",
    title: "Vanilla bean cupcakes",
    category: "Dessert",
    recipeSlug: "vanilla-bean-cupcakes",
  },
  "lemon-bars": {
    id: "lemon-bars",
    title: "Lemon bars",
    category: "Dessert",
    recipeSlug: "lemon-sesame-bars",
  },
};

export const VIDEO_PAGE_SECTIONS: VideoPageSectionConfig[] = [
  {
    id: "latest",
    // Manually curated — no publication dates in the catalog.
    title: "Latest videos",
    videoIds: ["salsa-verde-technique", "weeknight-chile-walkthrough", "chocolate-chunk-cookies"],
  },
  {
    id: "dinners",
    title: "Quick dinners",
    videoIds: ["skillet-supper", "one-pan-chicken", "taco-night"],
  },
  {
    id: "mexican",
    title: "Mexican",
    videoIds: ["salsa-verde-technique", "fresh-pico-de-gallo", "homemade-tortillas"],
  },
  {
    id: "desserts",
    title: "Desserts",
    videoIds: ["chocolate-chunk-cookies", "vanilla-bean-cupcakes", "lemon-bars"],
  },
  {
    id: "popular",
    // Manually curated — not driven by analytics or view counts.
    title: "Most popular",
    videoIds: ["chocolate-chunk-cookies", "salsa-verde-technique", "one-pan-chicken"],
  },
];

export function videoItemsByIds(ids: string[]) {
  return ids
    .map((id) => VIDEO_CATALOG[id])
    .filter((item): item is VideoItem => Boolean(item));
}
