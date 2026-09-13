import type { AdminDocTopic } from "../types";

export const seriesEditorDocTopic: AdminDocTopic = {
  id: "series-editor",
  title: "Series Editor",
  summary: "Create or edit a public Series collection and control what readers see.",
  category: "library",
  routes: ["/admin/series/new", "/admin/series/:id"],
  relatedTopicIds: ["series", "series-import", "youtube", "recipes"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "The Series editor manages one collection for the public /series experience — title, slug, description, membership, and publish state.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Edit title, slug, and editorial copy",
        "Curate membership and order for Mesa-only Series",
        "Save as Draft or Publish",
        "Preview a published Series on the public site",
        "For YouTube-backed Series, refresh membership from the playlist when needed",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Custom Series are Mesa-only — you curate items by hand",
        "YouTube-backed Series take membership/order from the playlist on refresh",
        "Refresh never overwrites Mesa title, intro, SEO, hero, or published state",
        "Playlist items you remove may return on the next refresh",
        "Deleting a Series is permanent — confirm carefully",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Keep public titles clear for readers",
        "Publish only when membership and copy are ready",
        "After playlist refresh, spot-check that linked recipes still make sense",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access edit Series."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Series — index",
        "Series Import — bring in a YouTube playlist",
        "YouTube — channel context",
        "Recipes — items you may link",
      ],
    },
  ],
};
