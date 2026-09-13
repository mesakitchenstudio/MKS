import type { AdminDocTopic } from "../types";

export const reviewsDocTopic: AdminDocTopic = {
  id: "reviews",
  title: "Reviews",
  summary: "Read, moderate, and respond to member reviews on Mesa recipes.",
  category: "community",
  routes: ["/admin/reviews"],
  relatedTopicIds: ["recipes", "members"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Reviews lists member feedback left on Mesa recipes — ratings, review text, and staff replies where you choose to respond.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Open a review to read the full content",
        "Reply to a member when a response is helpful",
        "Remove a review that should not stay public",
        "Use Select reviews for bulk delete when needed",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Moderation changes what appears on the public recipe page",
        "Replies are staff responses associated with the review",
        "Removing a review removes it from public display",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Reply courteously and specifically when a review deserves it",
        "Remove only content that violates standards or is clearly harmful",
        "Check the recipe page after moderating high-visibility reviews",
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
      bullets: ["Recipes — the recipes being reviewed", "Members — accounts that leave reviews"],
    },
  ],
};
