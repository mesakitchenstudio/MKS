import type { AdminDocTopic } from "../types";

export const searchConsoleDocTopic: AdminDocTopic = {
  id: "search-console",
  title: "Search Console",
  summary:
    "Understand how Mesa performs in Google Search using clicks, impressions, CTR and average position.",
  category: "analytics",
  routes: ["/admin/search-console"],
  relatedTopicIds: ["search-analytics", "site-health", "content-performance"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "This dashboard shows Google Search performance for Mesa — impressions, clicks, CTR, and average position.",
        "It is not Mesa’s on-site Search analytics, Site Health (technical discoverability), or Content Health (publishing readiness).",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Connect Google Search Console (owners)",
        "Select a verified Search Console property",
        "Sync data",
        "Review KPI cards and trends",
        "Inspect top pages and queries",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Mesa uses a read-only Google scope — it does not change your Search Console settings or site content",
        "Google data is delayed; it is not real-time",
        "“Last synced” is Mesa’s operational sync timestamp (shown in TRT where Admin times appear)",
        "“Data through” is Google’s latest available reporting date in the synced data",
        "The Mesa domain property (sc-domain:mesakitchenstudio.com) is the intended property when available",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Users with content access can view this page according to existing Admin rules. Connecting, selecting a property, syncing, and disconnecting are owner-managed actions.",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Avoid over-interpreting tiny early impression counts",
        "Review trends after enough impressions accumulate",
        "Use alongside Content Performance and Site Health for a fuller picture",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Search — Mesa on-site search queries",
        "Site Health — technical discoverability checks",
        "Content Performance — cross-source recipe metrics",
      ],
    },
  ],
};
