import type { AdminDocTopic } from "../types";

export const recipesDocTopic: AdminDocTopic = {
  id: "recipes",
  title: "Recipes",
  summary: "Find, filter and manage every Mesa recipe and create new recipes by type.",
  category: "publishing",
  routes: ["/admin"],
  relatedTopicIds: ["recipe-editor", "recipe-types", "content-health", "redirects"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "This is the main publishing catalogue for Mesa recipes. Every recipe appears here whether it is a Draft, Scheduled for later, or already Published.",
      ],
      bullets: [
        "Draft — saved in Admin, not visible on the public site",
        "Scheduled — will publish at the chosen time (shown in TRT where timestamps appear)",
        "Published — live on the public site",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: ["Use this page to find work quickly and open the right recipe."],
      bullets: [
        "Search by title",
        "Filter by recipe type or status (All, Published, Scheduled, Draft)",
        "Open a recipe in the Recipe Editor",
        "Create a new recipe (choose a type first)",
        "View a published recipe on the public site",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "A recipe type is required before you can create a new recipe",
        "Unpublished recipes (Draft or Scheduled) are not public",
        "Operational timestamps in Admin use TRT (Europe/Istanbul) where shown",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Create recipes with the correct type so fields and timing labels match the dish",
        "Use Content Health when you need a publishing or readiness review across many recipes",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Editors with content access can use this page. The Audience (member) Admin role cannot access Recipes.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: ["Continue in these areas when you need more detail."],
      bullets: [
        "Recipe Editor — write and publish one recipe",
        "Recipe Types — field templates for each kind of recipe",
        "Content Health — readiness across the catalogue",
        "Redirects — permanent URL changes for recipes",
      ],
    },
  ],
};
