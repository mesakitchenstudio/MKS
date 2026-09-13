import type { AdminDocTopic } from "../types";

export const contentCalendarDocTopic: AdminDocTopic = {
  id: "content-calendar",
  title: "Content Calendar",
  summary: "Plan and coordinate Mesa website recipe publishing and YouTube releases.",
  category: "publishing",
  routes: ["/admin/content-calendar"],
  relatedTopicIds: ["recipes", "youtube", "content-health", "content-performance"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Content Calendar is Mesa’s combined editorial planning surface. Website recipe publishing and YouTube releases stay separate systems — Calendar coordinates them; it does not own either one.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Move through months and use Jump to Today",
        "Schedule a Recipe publish or a YouTube release",
        "Filter by channel, timing/status, or linked/unlinked items",
        "Search titles and open a recipe when you need to edit",
        "Review performance links where they are available",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Times shown here use TRT (Europe/Istanbul)",
        "Calendar reflects publication and release records — follow the page’s current scheduling actions",
        "Scheduled recipes stay unpublished until their publish time",
        "YouTube schedule is separate from website recipe publishing",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Coordinate related recipe and YouTube releases when they belong together",
        "Confirm recipe ↔ video links where the Calendar shows them",
        "Use Calendar as a planning overview — open Recipes or YouTube for the full source of truth",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Access follows existing Admin rules: content and/or YouTube roles can use the Calendar. Recipe and YouTube actions appear only when your role allows them.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Recipes — catalogue and editors",
        "YouTube — channel, website video, and schedule tools",
        "Content Health — publishing readiness",
        "Content Performance — cross-source metrics",
      ],
    },
  ],
};
