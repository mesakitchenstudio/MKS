import type { AdminDocTopic } from "../types";

export const membersDocTopic: AdminDocTopic = {
  id: "members",
  title: "Members",
  summary: "Review Mesa member accounts and account-related activity.",
  category: "community",
  routes: ["/admin/members"],
  relatedTopicIds: ["reviews", "visitors", "newsletter", "team-access"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Members are people with Mesa public-site accounts. They are not Admin staff — Team Access manages Admin roles separately.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Browse or search member accounts",
        "Open a member for profile and activity detail",
        "Remove members when your role allows and policy requires it",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Members ≠ Admin team users",
        "Visitors are anonymous guests — different from registered Members",
        "Account actions on this page affect public-site users only",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Audience Admin roles with members access can use this page. Editors without members access cannot.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Reviews — feedback from members",
        "Visitors — anonymous guest activity",
        "Newsletter — signup subscribers (may overlap with members)",
        "Team Access — Admin staff, not public members",
      ],
    },
  ],
};
