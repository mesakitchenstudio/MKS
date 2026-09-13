import type { AdminDocTopic } from "../types";

export const contentPerformanceDocTopic: AdminDocTopic = {
  id: "content-performance",
  title: "Content Performance",
  summary: "Review cross-source performance for Mesa recipes and content.",
  category: "analytics",
  routes: ["/admin/content-performance"],
  relatedTopicIds: ["search-console", "visitors", "search-analytics", "youtube", "recipe-performance"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Content Performance shows cross-source metrics for recipes and public pages. Sources stay labeled — website, Google Search, Mesa funnel, and YouTube are never blended into one score.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Choose a date range",
        "Scan recipe and page rows by source columns",
        "Open a recipe’s performance detail when you need a deeper cut",
        "Follow coverage links to Search Console or YouTube when data is missing",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Different sources can lag by different amounts",
        "This is not Search Console alone, Visitors alone, on-site Search, or the YouTube Channel tab",
        "Missing source columns usually mean that integration is disconnected or not synced yet",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Compare like with like within a single source",
        "Use longer ranges when early data is thin",
        "Pair with Content Health when deciding what to improve editorially",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Editors with content access view Content Performance. YouTube columns appear when YouTube access and data allow.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Search Console — Google Search detail",
        "Visitors — anonymous site activity",
        "Search — on-site query analytics",
        "YouTube — channel and website-video analytics",
      ],
    },
  ],
};
