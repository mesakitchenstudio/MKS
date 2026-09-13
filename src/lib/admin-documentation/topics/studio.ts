import type { AdminDocTopic } from "../types";

export const studioDocTopic: AdminDocTopic = {
  id: "studio",
  title: "Studio",
  summary: "Manage Mesa Studio lesson relationships and homepage Studio presentation.",
  category: "publishing",
  routes: ["/admin/studio"],
  relatedTopicIds: ["recipes", "media"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Studio Admin curates which published recipes connect to each Studio lesson, and which recipes appear in homepage Studio presentation blocks.",
        "Links are manual — Mesa does not auto-match recipes to lessons.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Choose featured homepage / “From the kitchen” recipes where those controls appear",
        "Attach published recipes to a Studio lesson",
        "Open View lesson to check the public Studio page",
        "Save lesson link changes",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Only published recipes belong in public Studio/homepage curation",
        "Unpublished recipes stay out of public lesson and homepage surfaces",
        "Studio lesson pages are separate from recipe pages",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Prefer recipes that truly teach the lesson topic",
        "Keep homepage featured picks current and high quality",
        "Revisit links after major recipe rewrites",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access manage Studio curation."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: ["Recipes — publish and polish linked recipes", "Media — hero imagery used on those recipes"],
    },
  ],
};
