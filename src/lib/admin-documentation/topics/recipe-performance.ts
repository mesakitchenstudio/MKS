import type { AdminDocTopic } from "../types";

export const recipePerformanceDocTopic: AdminDocTopic = {
  id: "recipe-performance",
  title: "Recipe Performance",
  summary: "Read discovery and engagement signals for one recipe across Mesa analytics sources.",
  category: "analytics",
  routes: ["/admin/content-performance/recipes/:id"],
  relatedTopicIds: ["content-performance", "search-console", "youtube", "recipe-editor"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "This page focuses on one recipe’s performance. Sources and date ranges can differ — Search Console, site metrics, and YouTube do not always share the same window or delay.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Compare how the recipe is discovered, clicked, viewed, or watched — only for metrics Mesa actually shows",
        "Adjust the date range when the page offers one",
        "Open Search Console or YouTube context when linked",
        "Jump to Recipe Editor when you need to improve the page itself",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Different sources have different latency — yesterday’s Search Console may not match today’s site views",
        "Missing YouTube linkage means video metrics may be empty even if the recipe is popular on the site",
        "Performance tools do not publish or unpublish recipes",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Read trends over enough days to avoid noise",
        "Use Content Performance for portfolio view; use this page for one recipe deep-dive",
        "Pair weak discovery with Search Console and recipe SEO work in the editor",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with analytics access can view recipe performance."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Content Performance — portfolio",
        "Search Console — query discovery",
        "YouTube — video analytics",
        "Recipe Editor — improve the recipe",
      ],
    },
  ],
};
