import type { AdminDocTopic } from "../types";

export const recipeEditorDocTopic: AdminDocTopic = {
  id: "recipe-editor",
  title: "Recipe Editor",
  summary: "Create, edit, review, preview and publish a Mesa recipe.",
  category: "publishing",
  routes: ["/admin/recipes/new", "/admin/recipes/:id"],
  relatedTopicIds: [
    "recipes",
    "recipe-history",
    "recipe-types",
    "media",
    "redirects",
    "content-health",
  ],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "The Recipe Editor is where you write one recipe end to end. Sticky actions at the top keep Save, Update, Publish, and Preview available while you scroll.",
      ],
      bullets: [
        "Basics — title, slug, excerpt, type, discovery flags",
        "Details — yield, timing, classification, tools, tags",
        "Content — intro, ingredients, instructions, notes, FAQs",
        "Media — hero image, alt text, YouTube",
        "Advanced — floating video, YouTube metadata, nutrition",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Save or update a Draft",
        "Publish or update a live recipe",
        "Move a published recipe back to Draft when supported",
        "Schedule a future publish time",
        "Open Admin Preview (works for Draft, Scheduled, and Published)",
        "Open Revision History for meaningful saved versions",
        "Use AI-assisted filling, then review before publishing",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [
        "Draft recipes are not publicly visible. Admin Preview shows the current saved recipe layout without making a Draft live.",
      ],
      bullets: [
        "Publishing readiness is rechecked on the server when you publish — client hints are not enough",
        "Changing a slug can create a permanent redirect so old public URLs keep working",
        "Revisions keep meaningful saved versions; restore brings content back but keeps the current public URL and publication status",
      ],
    },
    {
      id: "how-it-works",
      title: "Timing",
      paragraphs: [
        "Total time is derived. There is no separate total field to edit.",
        "Total = Preparation + Cooking + Baking + Resting (and bread proofing when the type includes it).",
      ],
      bullets: [
        "Cooking — stovetop, pan, grill, or other active cooking (use 0 if none)",
        "Baking — oven time only (use 0 if the recipe is not baked)",
        "When Cooking and Baking are both set and different, both count toward Total and both appear in Preview",
        "If Cooking and Baking were historically synced to the same number, Mesa counts that heat once (no double total)",
      ],
    },
    {
      id: "when-to-use",
      title: "Tags and utensils",
      paragraphs: ["Tags and utensils accept one value at a time or several at once."],
      bullets: [
        "Single values still work as before",
        "Comma-separated lists can be added in one step",
        "Newline-separated paste works for bulk entry",
        "Duplicates are skipped automatically",
      ],
    },
    {
      id: "best-practices",
      title: "Media, SEO, and review",
      paragraphs: [],
      bullets: [
        "Add a clear hero image and descriptive alt text",
        "Fill excerpt and other SEO-facing fields before publishing",
        "Preview before publish — especially after AI fill",
        "Verify AI-inferred timing, ingredients, and instructions",
        "Check publishing readiness before going live",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Editors with content access can edit recipes. Audience Admin users cannot open the editor.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Recipes — catalogue and filters",
        "Recipe History — revisions and restore",
        "Recipe Types — which fields appear here",
        "Media — image library",
        "Redirects — URL changes",
        "Content Health — readiness across recipes",
      ],
    },
  ],
};
