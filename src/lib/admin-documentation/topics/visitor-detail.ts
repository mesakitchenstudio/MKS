import type { AdminDocTopic } from "../types";

export const visitorDetailDocTopic: AdminDocTopic = {
  id: "visitor-detail",
  title: "Visitor Detail",
  summary: "Inspect one anonymous visitor/session trail — approximate identity, not a Member account.",
  category: "analytics",
  routes: ["/admin/visitors/:visitorId"],
  relatedTopicIds: ["visitors", "members"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Visitor detail shows anonymous browsing context for one visitor id: first/last seen, pages, source, approximate location, and device signals when available.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Review page history for this visitor id",
        "Check first and last seen timestamps (TRT)",
        "Note referrer/source and approximate location when shown",
        "Compare device/browser hints if present",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "A visitor id is not necessarily a person or a Member account",
        "Registered Members are a separate concept under Members",
        "Location is approximate and IP-based — not GPS",
        "What Mesa stores for guests follows site privacy rules — treat detail as operational insight",
        "Timestamps display in Turkey Time (TRT)",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Avoid overstating identity certainty from a visitor id",
        "Use Visitors index for patterns; use this page for one trail",
        "Respect privacy — treat detail as operational insight, not personal investigation",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with analytics access can view visitor detail."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: ["Visitors — overview", "Members — registered accounts (separate)"],
    },
  ],
};
