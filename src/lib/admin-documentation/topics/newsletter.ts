import type { AdminDocTopic } from "../types";

export const newsletterDocTopic: AdminDocTopic = {
  id: "newsletter",
  title: "Newsletter",
  summary: "Review newsletter subscribers and draft/send newsletter campaigns.",
  category: "community",
  routes: ["/admin/newsletter", "/admin/newsletter/campaigns"],
  relatedTopicIds: ["members", "visitors"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Newsletter includes a subscriber ledger and a separate campaign composer. The ledger lists signup-form subscribers. Campaigns support draft editing, preview, dry-run, Owner test send, and Owner audience send. Status Sent means Mesa finished send processing — not confirmed inbox delivery.",
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
        "Send a test email to the Owner account only",
        "Send a ready campaign to eligible newsletter subscribers (Owner)",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Audience consent comes only from NewsletterSubscriber — never User.notify or follows",
        "Save before Dry Run, Test Send, or Audience Send — unsaved editor changes are blocked",
        "Preview and dry run never call the email provider",
        "Test send goes only to the authenticated Owner email and does not lock the campaign",
        "Audience send is Owner-only, requires confirmation, and locks the campaign (Sending → Sent)",
        "Provider accepted counts are immediate API acceptance, not inbox delivery",
        "Deliverability protection for hard bounces/complaints relies on the configured Resend team suppression list in MVP — separate from NewsletterSubscriber consent",
        "If a campaign remains Sending after interruption, do not resend until provider activity is reviewed",
        "There is no automatic whole-campaign retry or resume in this phase",
        "Welcome email behavior, if configured, is separate from campaign sending",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Audience can view the subscriber ledger. Campaign compose is Owner + Editor. Dry-run audience aggregates are Owner + Audience. Editors may compose and preview without recipient analytics. Real test send and audience send are Owner only.",
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
