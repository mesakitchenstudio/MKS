import type { AdminDocTopic } from "../types";

export const recipeTypeEditorDocTopic: AdminDocTopic = {
  id: "recipe-type-editor",
  title: "Recipe Type Editor",
  summary: "Configure the field template that Recipe Editor uses for one kind of recipe.",
  category: "library",
  routes: ["/admin/types/:id"],
  relatedTopicIds: ["recipe-types", "recipes", "recipe-editor"],
  sections: [
    {
      id: "about",
      title: "About this page",
      paragraphs: [
        "A recipe type is the template behind Recipe Editor. Core fields are shared across types; type-specific fields appear only for this kind of recipe.",
      ],
    },
    {
      id: "common-tasks",
      title: "Common tasks",
      paragraphs: [],
      bullets: [
        "Edit the type name and description",
        "Add type-specific fields",
        "Reorder fields in the ledger",
        "Adjust labels, help text, and options where the field allows",
        "Save changes carefully when recipes already use this type",
      ],
    },
    {
      id: "rules",
      title: "Important rules",
      paragraphs: [
        "Structural changes affect every recipe that uses this type — treat this page as high-impact.",
      ],
      bullets: [
        "Core/shared fields cannot be deleted from a type page",
        "Field kind may be locked once recipes already store values for that field",
        "Required toggles can force confirmations when existing recipes are missing values",
        "Reserved or duplicate field keys are rejected",
        "Do not make casual structural experiments on types used in production",
      ],
    },
    {
      id: "best-practices",
      title: "Best practices",
      paragraphs: [],
      bullets: [
        "Add fields only when editors truly need them",
        "Prefer stable labels that match how Mesa cooks and publishes",
        "Check how many recipes use the type before removing or renaming fields",
      ],
    },
    {
      id: "permissions",
      title: "Permissions",
      paragraphs: ["Owners and Editors with content access edit recipe types."],
    },
    {
      id: "related",
      title: "Related pages",
      paragraphs: [],
      bullets: [
        "Recipe Types — index of templates",
        "Recipes — create with a type",
        "Recipe Editor — where fields appear",
      ],
    },
  ],
};
