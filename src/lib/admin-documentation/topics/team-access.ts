import type { AdminDocTopic } from "../types";

export const teamAccessDocTopic: AdminDocTopic = {
  id: "team-access",
  title: "Team Access",
  summary: "Manage Mesa Admin users, roles, invitations, and active sessions.",
  category: "team",
  routes: ["/admin/staff"],
  relatedTopicIds: ["activity", "profile"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Team Access controls who can use Mesa Admin and what they can do. Public Members are managed separately under Members.",
      ],
    },
    {
      id: "how-it-works",
      title: "Roles",
      paragraphs: [],
      bullets: [
        "Owner — full Admin access, including Team Access",
        "Editor — publishing, library, reviews, and YouTube",
        "Audience — Members and Visitors only",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Invite or add staff",
        "Change a role",
        "Inspect last login and active sessions",
        "Revoke an individual session or all sessions for a user",
      ],
    },
    {
      id: "rules",
      title: "Sessions and location",
      paragraphs: [],
      bullets: [
        "Active now reflects recent presence",
        "Approximate location is IP-based and may update when the public IP changes",
        "Absolute timestamps use TRT",
        "The system owner recovery account is managed separately from ordinary invites",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Only owners can open Team Access."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Activity — audit log of important staff changes",
        "Profile — your own account and sessions",
      ],
    },
  ],
};
