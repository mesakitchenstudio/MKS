import type { AdminDocTopic } from "../types";

export const newsletterDocTopic: AdminDocTopic = {
  id: "newsletter",
  title: "Newsletter",
  summary: "Review newsletter subscribers and subscription activity.",
  category: "community",
  routes: ["/admin/newsletter", "/admin/newsletter/campaigns"],
  relatedTopicIds: ["members", "visitors"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Newsletter includes a subscriber ledger and a separate campaign composer. The ledger lists signup-form subscribers. Campaigns are draft editorial workflows with preview and dry-run — sending is not available from this surface yet.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Search subscribers",
        "Review active versus other subscription states",
        "Create and edit draft campaigns",
        "Preview general and synthetic personalized emails",
        "Run aggregate dry-run audience analysis (Owner / Audience)",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "This Admin surface does not send marketing campaigns yet",
        "Preview and dry run never call the email provider",
        "Unsubscribe and status fields reflect signup-form state where implemented",
        "Welcome email behavior, if configured, is separate from this ledger",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Audience can view the subscriber ledger. Campaign compose is Owner + Editor. Dry-run audience aggregates are Owner + Audience. Editors may compose and preview without recipient analytics.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: ["Members — registered accounts", "Visitors — anonymous traffic"],
    },
  ],
};
