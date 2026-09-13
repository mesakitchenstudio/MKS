import type { AdminDocTopic } from "../types";

export const activityDocTopic: AdminDocTopic = {
  id: "activity",
  title: "Activity",
  summary: "Review Mesa Admin audit events and important staff changes.",
  category: "team",
  routes: ["/admin/activity"],
  relatedTopicIds: ["team-access", "notifications"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Activity is the Admin audit log — who did what to which area of Mesa. It is not the Notifications inbox for schedule alerts.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Scan recent events",
        "Filter by area when filters are available (Content, Members, Staff, YouTube)",
        "Open related records when links are provided",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Timestamps display in TRT",
        "Only actions Mesa currently audits appear here",
        "Owner-only access — Editors do not see Activity",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners only."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Team Access — who has Admin roles",
        "Notifications — operational schedule alerts",
      ],
    },
  ],
};
