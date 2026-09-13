import type { AdminDocTopic } from "../types";

export const youtubeDocTopic: AdminDocTopic = {
  id: "youtube",
  title: "YouTube",
  summary: "Manage and review Mesa’s YouTube-related Admin workflows.",
  category: "analytics",
  routes: ["/admin/youtube"],
  relatedTopicIds: ["content-calendar", "content-performance", "recipes", "series"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "YouTube Admin covers channel catalog and attention, website-video funnel metrics, and the YouTube release schedule. Use the Channel, Website video, and Schedule tabs for each workflow.",
      ],
    },
    {
      id: "how-it-works",
      title: "Tabs",
      paragraphs: [],
      bullets: [
        "Channel — catalog sync, attention queue, Analytics connection, video list",
        "Website video — first-party actions on recipe pages with a video (not YouTube views)",
        "Schedule — YouTube publishing schedule in TRT, refresh, and optional local releases",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Connect or refresh YouTube Analytics when you are an owner",
        "Sync or refresh channel data",
        "Link videos to recipes from video detail screens",
        "Plan releases on Schedule and Jump to Today",
        "Review website-video funnel ranges",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Website video metrics are Mesa first-party events — not YouTube Studio views",
        "Schedule is separate from website recipe publishing",
        "Detailed per-video actions live on the video detail page",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Editors with YouTube access use this page. Connecting Analytics and some sync controls are owner-managed.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Content Calendar — cross-channel planning",
        "Content Performance — cross-source recipe metrics",
        "Recipes — linked recipe editors",
        "Series — playlist-backed collections",
      ],
    },
  ],
};
