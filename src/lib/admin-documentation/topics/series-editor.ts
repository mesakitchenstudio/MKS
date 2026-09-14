import type { AdminDocTopic } from "../types";

export const seriesEditorDocTopic: AdminDocTopic = {
  id: "series-editor",
  title: "Collection Editor",
  summary: "Create or edit a public Collection and control what readers see.",
  category: "library",
  routes: ["/admin/series/new", "/admin/series/:id"],
  relatedTopicIds: ["series", "series-import", "youtube", "recipes"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "The Collection editor manages one public Collection — title, slug, description, membership, and publish state. Mesa Collections are curated by hand; YouTube Collections take membership from a playlist on refresh.",
      ],
    },
    {
      id: "how-it-works",
      title: "Editorial fields",
      paragraphs: [],
      bullets: [
        "Title — visible page H1; may be edited without changing the public URL",
        "Description — short lead beneath the title; also the default search/social description when SEO description is empty",
        "Intro — longer editorial context; not used as metadata fallback",
        "Hero — recommended for stronger visual and social presentation",
        "SEO title — optional search/browser title; if empty, Mesa uses the Collection title; does not change the H1",
        "SEO description — optional search/social description; if empty, Mesa uses Description; aim for about 150–160 characters",
        "Slug — set at create; stays fixed afterward so public links remain stable (/series/[slug])",
        "Aim for at least 3 publicly visible items for a strong discovery page",
        "Publishing requires at least one publicly renderable recipe or video",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Edit title and editorial copy (slug only on create)",
        "Add and order Mesa recipes first for CUSTOM Collections",
        "Optionally include videos",
        "Save as Draft or Publish",
        "Preview Draft or Published Collections in Admin Preview",
        "Open the live public page when Published",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Draft Preview never makes a Collection public and mirrors what visitors would currently see",
        "Draft recipes can remain as members but stay hidden on the public page and in Preview",
        "Featured marks an editorial highlight in the item grid — it does not create a separate hero recipe section",
        "Related Collections automatically surface up to 3 relevant published Collections based on content overlap",
        "Published Collections may also appear automatically on Recipe heroes and relevant Category pages — there is no per-page placement control",
        "YouTube refresh does not overwrite Mesa title, intro, SEO, hero, or published state",
        "Collection URLs stay fixed after creation — editing the title does not change the slug",
        "Published Collections with zero public items stay reachable but are noindex and leave the sitemap and /series index until content returns",
        "BreadcrumbList structured data is emitted automatically on public Collection pages",
        "Public search remains recipes-only",
        "Deleting a Collection does not delete recipes",
        "Already-published Collections are not auto-unpublished if items later become invisible",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Use Collections for editorial or search intent, not bare Category duplicates — the editor warns softly when a title or slug matches a Category",
        "Preview before publishing",
        "After playlist refresh, spot-check linked recipes",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access edit Collections."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Collections — index",
        "Import YouTube Collection — bring in a playlist",
        "YouTube — channel context",
        "Recipes — items you may link",
      ],
    },
  ],
};
