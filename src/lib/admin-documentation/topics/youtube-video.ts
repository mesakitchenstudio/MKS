import type { AdminDocTopic } from "../types";

export const youtubeVideoDocTopic: AdminDocTopic = {
  id: "youtube-video",
  title: "YouTube Video",
  summary: "Inspect one YouTube video’s Mesa linkage, sync state, and related tools.",
  category: "analytics",
  routes: ["/admin/youtube/videos/:videoId"],
  relatedTopicIds: ["youtube", "recipes", "recipe-editor", "series"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "This page is about one YouTube video in Mesa Admin. Metadata and analytics come from YouTube; recipe linkage and Mesa editorial decisions belong to Mesa.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Review video title and YouTube metadata",
        "See or manage the linked Mesa recipe when present",
        "Sync or refresh YouTube data where the page offers it",
        "Check chapters, schedule, or analytics panels when shown",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "YouTube is the source of truth for video stats and channel metadata",
        "Linking a recipe does not rewrite the YouTube video itself",
        "Sync updates Mesa’s copy of YouTube fields — it does not publish Mesa recipes",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Confirm the correct recipe before linking",
        "Use the YouTube index for channel-wide work; use this page for one video",
        "After sync, spot-check titles and linkage if something looks stale",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with YouTube/content access use video detail tools."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "YouTube — channel overview",
        "Recipes — linked recipe catalogue",
        "Recipe Editor — improve the Mesa page",
        "Series — playlist-backed collections",
      ],
    },
  ],
};
