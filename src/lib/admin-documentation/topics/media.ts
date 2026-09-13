import type { AdminDocTopic } from "../types";

export const mediaDocTopic: AdminDocTopic = {
  id: "media",
  title: "Media",
  summary: "Manage images and other media used across Mesa recipes and content.",
  category: "library",
  routes: ["/admin/media"],
  relatedTopicIds: ["recipes", "recipe-editor", "media-asset"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Media is Mesa’s editorial image catalogue — identity, alt text, credit, and reuse. Uploads still store the bytes; this library owns the asset records editors reuse.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Upload or register an image",
        "Filter by kind, source, or active status",
        "Open an asset to edit metadata",
        "Reuse library assets from the Recipe Editor hero picker",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Alt text and identity matter for accessibility and reuse",
        "Deactivating or deleting media can affect recipes that still reference it",
        "Hero images for publish readiness are checked in Content Health / Recipe Editor",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Write clear alt text when you add an asset",
        "Prefer the library over one-off uploads when the same photo will be reused",
        "Check usage before removing an asset",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access manage Media."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: ["Recipes — where images appear publicly", "Recipe Editor — attach hero and supporting media"],
    },
  ],
};
