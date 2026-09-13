import type { AdminDocTopic } from "../types";

export const recipeHistoryDocTopic: AdminDocTopic = {
  id: "recipe-history",
  title: "Recipe History",
  summary: "Review meaningful saved versions of a recipe and restore content when needed.",
  category: "publishing",
  routes: ["/admin/recipes/:id/history", "/admin/recipes/:id/history/:revisionId"],
  relatedTopicIds: ["recipe-editor", "recipes"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Mesa keeps recipe revision history for meaningful saves. Each revision is a snapshot of recipe content from that save — not a full clone of every Admin setting.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Browse previous versions grouped by day",
        "Open a revision to inspect historical content",
        "Restore content from a revision when you need to undo a bad edit",
        "Return to the current recipe in the editor",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [
        "Restoring brings back content (ingredients, instructions, and related fields) but keeps the current public URL and publication status.",
      ],
      bullets: [
        "The recipe’s canonical id does not change when you restore",
        "Restore does not automatically publish a Draft",
        "Slug and status stay as they are on the current recipe",
        "Baseline revisions mark the first captured version for older recipes",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Inspect a revision before restoring",
        "Use history to recover from accidental edits",
        "After restore, Preview the recipe before republishing if it is live",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access can view history and restore."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: ["Recipe Editor — current working copy", "Recipes — catalogue"],
    },
  ],
};
