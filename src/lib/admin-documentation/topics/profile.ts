import type { AdminDocTopic } from "../types";

export const profileDocTopic: AdminDocTopic = {
  id: "profile",
  title: "Profile",
  summary: "Manage your own Admin profile and active sessions.",
  category: "account",
  routes: ["/admin/profile"],
  relatedTopicIds: ["team-access"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Profile is your personal Admin account page — your details, photo, and sessions. Team Access manages other staff; Profile manages you.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Update your profile details and photo",
        "Review devices and sessions signed in as you",
        "Revoke sessions on devices you no longer use",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "You only manage your own account here",
        "Session location is approximate (IP-based), not GPS",
        "Timestamps use TRT where shown",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Any authenticated Admin can open their own Profile."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: ["Team Access — invite and manage other Admin users (owners)"],
    },
  ],
};
