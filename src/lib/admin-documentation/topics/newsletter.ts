import type { AdminDocTopic } from "../types";

export const newsletterDocTopic: AdminDocTopic = {
  id: "newsletter",
  title: "Newsletter",
  summary: "Review newsletter subscribers and subscription activity.",
  category: "community",
  routes: ["/admin/newsletter"],
  relatedTopicIds: ["members", "visitors"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Newsletter lists subscribers collected from Mesa newsletter signup forms. It is a subscriber ledger — not a full email campaign studio.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Search subscribers",
        "Review active versus other subscription states",
        "Inspect signup context when it is shown",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "This page does not send marketing campaigns by itself",
        "Unsubscribe and status fields reflect signup-form state where implemented",
        "Welcome email behavior, if configured, is separate from this ledger",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Audience Admin roles with members access can view Newsletter."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: ["Members — registered accounts", "Visitors — anonymous traffic"],
    },
  ],
};
