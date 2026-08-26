import type { RecipeYoutubeRelatedVideo } from "@/data/youtube-types";
import { site } from "@/data/site";

/** Placeholder catalog — replace with real YouTube IDs when videos are ready. */
export type VideoPageSection = {
  id: string;
  title: string;
  note?: string;
  videos: RecipeYoutubeRelatedVideo[];
};

const PLACEHOLDER = (title: string, index: number): RecipeYoutubeRelatedVideo => ({
  title,
  videoId: "PLACEHOLDER",
  url: site.social.youtube,
  thumbnail: "https://i.ytimg.com/vi/PLACEHOLDER/hqdefault.jpg",
  duration: "—",
  label: "Placeholder",
});

export const VIDEO_PAGE_SECTIONS: VideoPageSection[] = [
  {
    id: "latest",
    title: "Latest videos",
    note: "Placeholder entries — link to the channel until individual IDs are added.",
    videos: [
      PLACEHOLDER("New from the studio", 1),
      PLACEHOLDER("Weeknight dinner walkthrough", 2),
      PLACEHOLDER("Baking basics", 3),
    ],
  },
  {
    id: "dinners",
    title: "Quick dinners",
    videos: [
      PLACEHOLDER("30-minute skillet supper", 4),
      PLACEHOLDER("One-pan chicken", 5),
      PLACEHOLDER("Taco night", 6),
    ],
  },
  {
    id: "mexican",
    title: "Mexican",
    videos: [
      PLACEHOLDER("Salsa verde technique", 7),
      PLACEHOLDER("Fresh pico de gallo", 8),
      PLACEHOLDER("Homemade tortillas", 9),
    ],
  },
  {
    id: "desserts",
    title: "Desserts",
    videos: [
      PLACEHOLDER("Chocolate chunk cookies", 10),
      PLACEHOLDER("Vanilla bean cupcakes", 11),
      PLACEHOLDER("Lemon bars", 12),
    ],
  },
  {
    id: "popular",
    title: "Most popular",
    videos: [
      PLACEHOLDER("Studio favorite #1", 13),
      PLACEHOLDER("Studio favorite #2", 14),
      PLACEHOLDER("Studio favorite #3", 15),
    ],
  },
];
