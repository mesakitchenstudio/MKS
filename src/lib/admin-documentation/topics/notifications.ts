import type { AdminDocTopic } from "../types";

export const notificationsDocTopic: AdminDocTopic = {
  id: "notifications",
  title: "Notifications",
  summary: "Review operational alerts and items that may require Admin attention.",
  category: "publishing",
  routes: ["/admin/notifications"],
  relatedTopicIds: ["content-calendar", "recipes", "activity"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Notifications are operational alerts for scheduled publishing and related Admin work. This is not the Activity audit log.",
      ],
    },
    {
      id: "how-it-works",
      title: "What you may see",
      paragraphs: [
        "Most alerts relate to scheduled recipe publish outcomes — succeeded, blocked, retrying, or cancelled.",
      ],
      bullets: [
        "Severity labels help separate info, success, and needs-attention items",
        "Each Admin has their own read/dismiss receipts",
        "Mark all read clears unread items for you when that action is available",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Scan unread alerts",
        "Open the linked recipe or schedule context when provided",
        "Mark all read when you have caught up",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Notifications are not email or push alerts unless Mesa later adds that channel",
        "Activity is a separate audit history of staff changes",
        "Needs-attention items deserve follow-up in Recipes or the Calendar",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access see their notification inbox."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Content Calendar — schedule context",
        "Recipes — fix blocked publishes",
        "Activity — staff audit log (owners)",
      ],
    },
  ],
};
