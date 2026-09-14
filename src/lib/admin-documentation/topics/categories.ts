import type { AdminDocTopic } from "../types";

export const categoriesDocTopic: AdminDocTopic = {
  id: "categories",
  title: "Categories",
  summary: "Manage broad public taxonomy pages used to organize and discover Mesa recipes.",
  category: "library",
  routes: ["/admin/categories"],
  relatedTopicIds: ["recipes", "recipe-editor", "series", "recipe-types"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Categories are Mesa’s broad public taxonomy for discovery. Each Category has a public landing page at /category/[slug]. They are not the same as free-form recipe tags, and they are not editorial Collections.",
        "Use Categories for broad labels such as Breakfast, Desserts, Breads, Main Dishes, Oven, or Stovetop. Use Collections for compound editorial intent such as French Desserts or Easy Breakfast Recipes.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Create a category (name, slug, group, description)",
        "Rename or edit an existing category",
        "Associate recipes with categories from the Recipe Editor",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "Public Category URL is /category/[slug] — catalogue filters like /recipes?category= are separate functional views and are not SEO destinations",
        "Prefer stable names and slugs — public discovery URLs depend on category slugs",
        "Avoid unnecessary renames that affect published content without a plan",
        "Slugs must stay unique",
        "Categories with fewer than 3 published recipes stay reachable but are noindex and omitted from the sitemap until enough content exists",
        "Description supports visitors and is used for search/social metadata when present",
        "Relevant published Collections may appear automatically after the Category recipe grid — editors do not attach them manually",
        "Do not use Category.group for cuisine, ingredient, or diet — those are separate future concerns",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Keep category names clear for readers and editors",
        "Avoid redundant or overlapping categories",
        "Keep related groups coherent (desserts, course, method, season/holiday)",
        "Avoid creating a Collection that only restates an existing Category name",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: [
        "Owners and Editors with content access manage categories. Audience Admin users cannot.",
      ],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Recipes — assign work from the catalogue",
        "Recipe Editor — attach categories to a recipe",
        "Collections — curated editorial hubs (separate from categories; may surface on Category pages automatically)",
        "Recipe Types — structural templates, not taxonomy",
      ],
    },
  ],
};
