import type { AdminDocTopic } from "../types";

export const categoriesDocTopic: AdminDocTopic = {
  id: "categories",
  title: "Categories",
  summary: "Manage the category structure used to organize and discover Mesa recipes.",
  category: "library",
  routes: ["/admin/categories"],
  relatedTopicIds: ["recipes", "recipe-editor", "series", "recipe-types"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Categories are Mesa’s taxonomy for discovery and menus. They are not the same as free-form recipe tags.",
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
        "Prefer stable names and slugs — public discovery URLs can depend on category slugs",
        "Avoid unnecessary renames that affect published content without a plan",
        "Slugs must stay unique",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Keep category names clear for readers and editors",
        "Avoid redundant or overlapping categories",
        "Keep related groups coherent (for example courses and collections)",
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
        "Series — curated collections (separate from categories)",
        "Recipe Types — structural templates, not taxonomy",
      ],
    },
  ],
};
