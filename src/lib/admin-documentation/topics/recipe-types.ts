import type { AdminDocTopic } from "../types";

export const recipeTypesDocTopic: AdminDocTopic = {
  id: "recipe-types",
  title: "Recipe Types",
  summary: "Manage recipe templates and field structures used when creating recipes.",
  category: "library",
  routes: ["/admin/types"],
  relatedTopicIds: ["recipes", "recipe-editor", "recipe-type-editor"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "Recipe types are templates that define which fields are available when authoring each kind of recipe — for example Bread, Cake, or Main.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Create a new recipe type",
        "Open a type to adjust core and type-specific fields",
        "Review how many recipes use each type",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [],
      bullets: [
        "The type you choose when creating a recipe controls the editor fields you see",
        "Changing type structure can affect existing recipes that share that type",
        "Avoid unnecessary structural changes on types already used in production",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Prefer stable types that match how Mesa cooks and publishes",
        "Add type-specific fields only when they help editors and readers",
        "Create recipes with the correct type from the start",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access manage recipe types."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: ["Recipes — create with a type", "Recipe Editor — fields come from the selected type"],
    },
  ],
};
