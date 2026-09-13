import type { AdminDocTopic } from "../types";

export const visitorsDocTopic: AdminDocTopic = {
  id: "visitors",
  title: "Visitors",
  summary: "Understand anonymous and guest website activity and navigation behavior.",
  category: "analytics",
  routes: ["/admin/visitors"],
  relatedTopicIds: ["members", "search-analytics", "content-performance"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Visitors shows anonymous website activity. Signed-in members are excluded from this guest view.",
      ],
    },
    {
      id: "how-it-works",
      title: "What you see",
      paragraphs: [],
      bullets: [
        "Guest and session concepts for anonymous traffic",
        "First and last seen times",
        "Approximate location from public IP (not GPS)",
        "Popular paths and traffic sources where implemented",
        "Consent gating may limit what is collected",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Review audience summaries",
        "Open a guest for detail",
        "Remove guest records when policy and permissions allow",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Location is approximate and IP-based — not GPS",
        "Operational timestamps use TRT where shown",
        "A guest visitor is not a registered Member",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Audience Admin roles with members access use Visitors. Some network diagnostics and deletes are owner-only.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Members — registered accounts",
        "Search — on-site search queries",
        "Content Performance — recipe-level metrics",
      ],
    },
  ],
};
