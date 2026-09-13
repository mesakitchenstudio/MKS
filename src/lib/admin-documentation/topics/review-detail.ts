import type { AdminDocTopic } from "../types";

export const reviewDetailDocTopic: AdminDocTopic = {
  id: "review-detail",
  title: "Review Detail",
  summary: "Read one member review in context, reply as staff, or remove it.",
  category: "community",
  routes: ["/admin/reviews/:id"],
  relatedTopicIds: ["reviews", "members", "recipes"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "This page shows one review with recipe context, member attribution, rating, and the conversation thread.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Read the full review and recipe context",
        "Open the recipe or member when links are available",
        "Post or edit a staff reply",
        "Remove a reply or remove the review when it must leave Mesa",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Staff replies appear as Mesa responses on the public recipe when reviews are shown",
        "“Needs response” means no staff reply yet",
        "Removal deletes the review from Mesa — use it carefully",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Keep replies professional and short",
        "Use the Reviews index for queue overview; use this page for one conversation",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access moderate reviews."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: ["Reviews — moderation queue", "Members — member context", "Recipes — reviewed recipe"],
    },
  ],
};
