import type { AdminDocTopic } from "../types";

export const redirectsDocTopic: AdminDocTopic = {
  id: "redirects",
  title: "Redirects",
  summary: "Manage permanent recipe URL redirects and protect old published links.",
  category: "library",
  routes: ["/admin/redirects"],
  relatedTopicIds: ["recipe-editor", "recipes", "site-health", "search-console"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Redirects keep old published recipe URLs working when a slug changes. Mesa creates a permanent redirect from the old path to the current path automatically.",
      ],
    },
    {
      id: "how-it-works",
      title: "How redirects behave",
      paragraphs: [],
      bullets: [
        "Old public path → current recipe path",
        "Chains are flattened where Mesa can safely do so",
        "Cycle safety prevents loops",
        "Deactivating a row stops following that redirect",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Inspect old and new paths",
        "Activate or deactivate a redirect when you understand the impact",
        "Use Site Health if redirect integrity checks report problems",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Do not deactivate redirects without understanding visitor and SEO impact",
        "A draft recipe does not become public merely because a redirect exists",
        "The recipe’s internal id remains its identity even when the public URL changes",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access manage redirects."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Recipe Editor — where slug changes originate",
        "Recipes — find the live recipe",
        "Site Health — redirect integrity checks",
        "Search Console — search demand on old and new URLs",
      ],
    },
  ],
};
