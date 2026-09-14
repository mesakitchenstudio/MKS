import type { AdminDocTopic } from "../types";

export const seriesDocTopic: AdminDocTopic = {
  id: "series",
  title: "Collections",
  summary:
    "Create and manage curated public collections of Mesa recipes and videos.",
  category: "library",
  routes: ["/admin/series"],
  relatedTopicIds: ["series-editor", "series-import", "youtube", "recipes", "categories"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Collections are curated public discovery destinations for Mesa recipes (and optional videos). Public visitors see them under Collections at /series — the Admin route stays /admin/series.",
        "Collections should represent an angle, occasion, technique, theme, or search intent — not simply duplicate a Category taxonomy page. Use Categories for broad labels (Breakfast, Desserts, Breads); use Collections for compound editorial hubs (French Desserts, Easy Breakfast Recipes, 30-Minute Meals).",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Create a Mesa Collection for editorial hubs (French Desserts, Easy Breakfast, Weekend Baking)",
        "Import a YouTube playlist as a YouTube Collection",
        "Edit membership, order, and publish state",
        "Preview Draft Collections before publishing",
      ],
    },
    {
      id: "how-it-works",
      title: "Collection types",
      paragraphs: [
        "Mesa Collection (CUSTOM) — manually curated recipes and optional videos.",
        "YouTube Collection (YOUTUBE) — membership/order can refresh from a playlist; Mesa owns title, intro, SEO, and publish state.",
        "Categories are broad taxonomy (for example Desserts). Strong Collections add intent: French Desserts, Easy Desserts for Beginners, Chocolate Desserts, Weekend Baking, 30-Minute Meals.",
      ],
    },
    {
      id: "discovery",
      title: "Public discovery",
      paragraphs: [
        "Published Collections may be discovered from the Collections index (/series), relevant Recipe pages (compact “Part of” links), relevant Category pages (after the recipe grid), Related Collections on a Collection detail page, the homepage featured Collection, and site navigation/footer.",
        "Recipe and Category discovery is derived automatically from membership and relevance. Editors do not manually choose every placement, and a Collection is not guaranteed to appear on every page. The /series index remains the complete public browse hub.",
        "Good Collection themes improve contextual matching. Generic Category clones are intentionally suppressed from some discovery surfaces. Member Saved Collections are unrelated. Public URLs remain /series/[slug] even though visitors see the word Collections.",
        "Public search and the /recipes catalogue stay recipes-only for now — Collection search is intentionally deferred.",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Draft Collections are not public and stay out of the sitemap",
        "Published Collections show only published recipes (and public videos)",
        "Published Collections with zero publicly visible items stay reachable but are noindex and leave the sitemap and /series index until content returns",
        "The /series hub is noindex when there are no eligible Collections, and is omitted from the sitemap in that case",
        "Collection slug stays fixed after creation — title edits do not change the public URL",
        "SEO title overrides the browser/search title only; the visible H1 stays the Collection title",
        "Private Saved Collections (member folders) are a separate feature",
        "Public URLs remain /series/[slug] — there is no /collections alias",
        "Avoid creating a Collection that only restates an existing Category name",
        "BreadcrumbList structured data is added automatically on public Collection pages",
        "Public search and the /recipes catalogue stay recipes-only",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access manage Collections."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Collection Editor — create or edit one collection",
        "Import YouTube Collection — playlist import",
        "YouTube — channel tools",
        "Recipes — items you may include",
      ],
    },
  ],
};
