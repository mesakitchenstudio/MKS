import type { AdminDocTopic } from "../types";

export const seriesDocTopic: AdminDocTopic = {
  id: "series",
  title: "Series",
  summary: "Manage public recipe and video series and organized content collections.",
  category: "library",
  routes: ["/admin/series"],
  relatedTopicIds: ["youtube", "recipes", "categories", "series-editor", "series-import"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Series are editorial collections for the public site (routes stay under /series). You can import YouTube playlists or build custom Mesa-only collections.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Import a YouTube playlist",
        "Create a custom Series",
        "Open a Series to edit membership and presentation",
        "Review sync status for playlist-backed Series",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Playlist-backed Series can sync from YouTube; custom Series are Mesa-only",
        "Public Series pages only show published, eligible content",
        "Detailed import and sync controls live on the Series editor screens",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Keep Series titles clear for readers",
        "Prefer playlist import when the YouTube playlist is the source of truth",
        "After major recipe changes, confirm Series membership still makes sense",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access manage Series."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "YouTube — channel and playlist context",
        "Recipes — items that appear in Series",
        "Categories — taxonomy, separate from Series collections",
      ],
    },
  ],
};
