/**
 * Development-only YouTube metadata for QA of timestamp links and related videos.
 * Not used in production rendering — recipes load YouTube data from the database.
 */
import type { RecipeYoutube } from "@/data/youtube-types";

export const DEV_YOUTUBE_FIXTURE: RecipeYoutube = {
  videoId: "dQw4w9WgXcQ",
  duration: "4:21",
  hook: "See exactly how far we roast the tomatillos and what the final texture should look like.",
  ctaDescription: "See the roasting technique, texture, and final consistency.",
  timestamps: [
    { stepIndex: 0, time: 45, label: "See the roasting technique" },
    { stepIndex: 1, time: 132, label: "See the right texture" },
  ],
  relatedVideos: [
    {
      videoId: "dQw4w9WgXcQ",
      title: "Restaurant-style guacamole",
      duration: "5:12",
      category: "Mexican",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    {
      videoId: "dQw4w9WgXcQ",
      title: "Fresh pico de gallo",
      duration: "3:48",
      category: "Mexican",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    {
      videoId: "dQw4w9WgXcQ",
      title: "Homemade tortilla chips",
      duration: "6:05",
      category: "Snacks",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
  ],
};

/** Raw blob using documented alias keys — for parser QA only. */
export const DEV_YOUTUBE_ALIAS_BLOB = {
  videoId: "dQw4w9WgXcQ",
  sectionDescription: "Section copy from alias.",
  ctaDescription: "CTA copy from alias.",
  timestamps: [{ instructionIndex: 0, seconds: 45, label: "See the roasting technique" }],
  relatedYoutubeVideos: [
    {
      videoId: "dQw4w9WgXcQ",
      title: "Related via alias",
      duration: "5:12",
      category: "Mexican",
    },
  ],
};
