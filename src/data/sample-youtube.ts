import type { RecipeYoutube } from "@/data/youtube-types";
import { site } from "@/data/site";

/**
 * Sample YouTube metadata for local seed / dev.
 * Replace PLACEHOLDER video IDs with real Mesa Kitchen Studio uploads when ready.
 */
export const SALSA_VERDE_YOUTUBE: RecipeYoutube = {
  videoId: "PLACEHOLDER",
  title: "How to Make Salsa Verde",
  duration: "4:21",
  url: "https://www.youtube.com/watch?v=PLACEHOLDER",
  hook:
    "See exactly how far we roast the tomatillos and what the final texture should look like.",
  playlistUrl: `${site.social.youtube}/playlists`,
  playlistLabel: "Mexican recipes",
  timestamps: [
    {
      label: "See the roasting technique",
      time: 45,
      stepIndex: 0,
    },
    {
      label: "See the right texture",
      time: 132,
      stepIndex: 1,
    },
  ],
  relatedVideos: [
    {
      title: "Restaurant-style guacamole",
      videoId: "RELATEDVID1",
      url: "https://www.youtube.com/watch?v=RELATEDVID1",
      duration: "5:12",
      label: "Mexican",
    },
    {
      title: "Fresh pico de gallo",
      videoId: "RELATEDVID2",
      url: "https://www.youtube.com/watch?v=RELATEDVID2",
      duration: "3:48",
      label: "Mexican",
    },
    {
      title: "Homemade tortilla chips",
      videoId: "RELATEDVID3",
      url: "https://www.youtube.com/watch?v=RELATEDVID3",
      duration: "6:05",
      label: "Snacks",
    },
  ],
};
