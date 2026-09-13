import type { AdminDocTopic } from "../types";

export const siteHealthDocTopic: AdminDocTopic = {
  id: "site-health",
  title: "Site Health",
  summary:
    "Monitor technical discoverability and website-level issues that can affect Mesa content.",
  category: "publishing",
  routes: ["/admin/site-health"],
  relatedTopicIds: ["content-health", "search-console", "redirects"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Site Health checks technical discoverability for public Mesa routes — redirects, sitemap membership, robots/noindex policy, structured data builders, and public relationships.",
        "It is not a ranking score, Search Console performance, or Content Health (recipe publishing readiness).",
      ],
    },
    {
      id: "how-it-works",
      title: "What Mesa checks",
      paragraphs: ["Checks are grouped by theme:"],
      bullets: [
        "Routing and redirects — self-loops, cycles, chains, invalid paths, missing targets",
        "Indexing — sitemap membership for recipes/series, robots rules, noindex surfaces",
        "Canonical URLs — site URL validity and public canonicals",
        "Structured data — Recipe JSON-LD shape and related builder rules",
        "Internal relationships — published collection items resolve publicly",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Scan the checklist for warnings and failures",
        "Open the linked Admin tool for an issue when available",
        "Fix redirects, sitemap coverage, or content relationships as needed",
      ],
    },
    {
      id: "rules",
      title: "Important distinctions",
      paragraphs: [],
      bullets: [
        "Site Health → technical/site discoverability",
        "Content Health → recipe publishing completeness and readiness",
        "Search Console → how Mesa performs in Google Search",
        "Missing recipe hero images remain a Content Health concern",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access can view Site Health."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Content Health — publishing readiness",
        "Search Console — Google Search metrics",
        "Redirects — permanent recipe URL redirects",
      ],
    },
  ],
};
