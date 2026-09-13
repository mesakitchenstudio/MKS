import type { AdminDocTopic } from "../types";

export const mediaAssetDocTopic: AdminDocTopic = {
  id: "media-asset",
  title: "Media Asset",
  summary: "Edit one media asset’s identity, alt text, and lifecycle in the Mesa library.",
  category: "library",
  routes: ["/admin/media/:id"],
  relatedTopicIds: ["media", "recipe-editor"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "This page manages a single library asset — display title, alt text, credit, status, and usage. The Media index lists the full catalogue.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Update identity metadata and alt text",
        "Review where the asset is used",
        "Activate or deactivate the asset",
        "Delete the asset only when it is unused",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Delete is blocked while the asset is still in use — detach it from recipes first, or deactivate instead",
        "Deactivating keeps the record but marks it inactive for editorial reuse",
        "Changing this asset’s metadata does not invent new recipe hero URLs; recipes that reference the asset keep their existing links",
        "Owned upload bytes may be removed only when the asset is unused and deleted",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Write clear alt text for accessibility",
        "Check usage before deleting",
        "Prefer deactivate when you want to retire an image without breaking references yet",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access manage media assets."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: ["Media — full library", "Recipe Editor — attach heroes from the library"],
    },
  ],
};
