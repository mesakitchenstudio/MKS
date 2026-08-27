/** Persisted category.group values and admin/public display labels. */

export const CATEGORY_GROUP_ORDER = ["desserts", "course", "method", "holiday"] as const;

export type CategoryGroup = (typeof CATEGORY_GROUP_ORDER)[number];

export const CATEGORY_GROUP_OPTIONS: { value: CategoryGroup; label: string }[] = [
  { value: "desserts", label: "Desserts" },
  { value: "course", label: "Course" },
  { value: "method", label: "Method" },
  { value: "holiday", label: "Season" },
];

export function categoryGroupLabel(group: string) {
  return CATEGORY_GROUP_OPTIONS.find((item) => item.value === group)?.label ?? group;
}

export function isValidCategoryGroup(group: string): group is CategoryGroup {
  return CATEGORY_GROUP_ORDER.includes(group as CategoryGroup);
}

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  group: string;
  recipeCount: number;
};

export function formatRecipeCount(count: number) {
  if (count === 1) return "1 recipe";
  return `${count} recipes`;
}

export function partitionCategoriesByGroup(categories: AdminCategory[]) {
  const buckets = new Map<string, AdminCategory[]>();
  for (const group of CATEGORY_GROUP_ORDER) {
    buckets.set(group, []);
  }
  for (const category of categories) {
    const bucketKey = isValidCategoryGroup(category.group) ? category.group : "course";
    buckets.get(bucketKey)!.push(category);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return CATEGORY_GROUP_ORDER.map((group) => ({
    group,
    label: categoryGroupLabel(group),
    categories: buckets.get(group) ?? [],
  }));
}
