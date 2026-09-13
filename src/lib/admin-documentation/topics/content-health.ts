import type { AdminDocTopic } from "../types";

export const contentHealthDocTopic: AdminDocTopic = {
  id: "content-health",
  title: "Content Health",
  summary: "Review recipe publishing readiness and identify recipes that need attention.",
  category: "publishing",
  routes: ["/admin/content-health"],
  relatedTopicIds: ["recipes", "recipe-editor", "site-health", "content-performance"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Content Health is powered by Publishing Readiness. It shows which recipes need attention, which drafts are ready, and what to improve before publishing.",
        "It is not Google SEO analytics and not Site Health (technical discoverability).",
      ],
      bullets: [
        "Published — live recipes and their remaining recommendations",
        "Needs attention — blocking issues that prevent a clean publish",
        "Recommendations — non-blocking improvements",
        "Drafts ready — drafts that can publish under current readiness rules",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Filter by status, health, or recipe type",
        "Search for a recipe",
        "Open Review recipe to fix issues in the editor",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Recommendations may be non-blocking",
        "Not-ready states prevent publish when readiness rules require it",
        "Ready with recommendations can still be publishable",
        "Publishing always rechecks readiness on the server",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Resolve blocking issues first",
        "Then review recommendations",
        "Do not treat every recommendation as mandatory",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access use Content Health."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Recipes — open work from the catalogue",
        "Recipe Editor — fix readiness issues",
        "Site Health — technical discoverability",
        "Content Performance — traffic and engagement after publish",
      ],
    },
  ],
};
