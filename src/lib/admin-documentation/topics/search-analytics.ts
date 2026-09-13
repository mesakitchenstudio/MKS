import type { AdminDocTopic } from "../types";

export const searchAnalyticsDocTopic: AdminDocTopic = {
  id: "search-analytics",
  title: "Search",
  summary: "Understand what visitors search for inside the Mesa website.",
  category: "analytics",
  routes: ["/admin/search"],
  relatedTopicIds: ["search-console", "content-performance", "recipes"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Search shows popular recipe searches and zero-result terms from consented visitors on Mesa. It is not a traffic dashboard and not Google Search Console.",
      ],
    },
    {
      id: "how-it-works",
      title: "Search vs Search Console",
      paragraphs: [],
      bullets: [
        "Search — queries performed on Mesa (on-site Search events)",
        "Search Console — queries performed on Google that surfaced Mesa",
        "Ingest is consent-gated where privacy rules require it",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Choose a date range (7 / 28 / 90 days)",
        "Review popular queries and zero-result terms",
        "Use gaps to improve recipe titles, tags, or new recipes",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "This is not per-person browsing history",
        "Zero-result terms often signal content gaps, not site errors",
        "Do not confuse on-site Search with Google Search Console",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access view on-site Search analytics."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Search Console — Google Search performance",
        "Content Performance — broader recipe metrics",
        "Recipes — create or improve matching content",
      ],
    },
  ],
};
