import type { AdminDocTopic } from "../types";

export const memberDetailDocTopic: AdminDocTopic = {
  id: "member-detail",
  title: "Member Detail",
  summary: "Inspect one registered Mesa member — not an Admin staff account.",
  category: "community",
  routes: ["/admin/members/:id"],
  relatedTopicIds: ["members", "reviews", "visitors"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Members are registered site users. This page is not an Admin staff account. Use it to understand one member’s profile, presence, and account activity.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Review name, email, join date, and sign-in method",
        "Check last seen / online status",
        "See saved recipe count",
        "Review connection history and approximate location when shown",
        "Remove the account when you have permission and the action is intentional",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Member ≠ Admin staff — staff access is managed under Team Access",
        "Removing a member permanently deletes their account, saved recipes, and account activity",
        "Approximate location is IP-based when available — not GPS",
        "Anonymous Visitors are a separate concept under Visitors",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Use Members index for search and overview",
        "Confirm identity carefully before removing an account",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Editors with members access can view member detail. Account removal is limited to roles that can delete members.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Members — directory",
        "Reviews — member reviews live in the Reviews area",
        "Visitors — anonymous browsing (separate)",
      ],
    },
  ],
};
