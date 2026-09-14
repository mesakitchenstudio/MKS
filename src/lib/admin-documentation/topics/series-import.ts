import type { AdminDocTopic } from "../types";

export const seriesImportDocTopic: AdminDocTopic = {
  id: "series-import",
  title: "Import YouTube Collection",
  summary: "Import a YouTube playlist into a Mesa YouTube Collection.",
  category: "library",
  routes: ["/admin/series/import"],
  relatedTopicIds: ["series", "series-editor", "youtube"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Import creates a YouTube Collection from a public channel playlist. Videos and order are imported; Mesa editorial fields (SEO, hero, intro) stay for you to enrich afterward.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Browse available public playlists",
        "Import a playlist that is not yet linked",
        "Open Edit Collection when a playlist was already imported",
        "Create a Mesa Collection instead when you do not want playlist sync",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Only public channel playlists appear here",
        "Import attaches matching recipes when Mesa already knows the video",
        "Import does not invent finished SEO or hero imagery",
        "Already-imported playlists open the existing Collection — they are not duplicated casually",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "After import, open the Collection editor and review title, description, and publish state",
        "Confirm recipe links for videos that should point at Mesa recipes",
        "Prefer a Mesa Collection when the set is Mesa-authored, not playlist-driven",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access can import Collections."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Collections — index",
        "Collection Editor — finish editorial work",
        "YouTube — channel tools",
      ],
    },
  ],
};
