import type { Category } from "./types";

export const categories: Category[] = [
  {
    slug: "cakes",
    name: "Cakes",
    description: "Olive-oil loaves, layer cakes, and cupcakes baked for the table.",
    group: "desserts",
  },
  {
    slug: "cookies",
    name: "Cookies",
    description: "Chewy, crisp, and everything in between.",
    group: "desserts",
  },
  {
    slug: "brownies-bars",
    name: "Brownies & Bars",
    description: "Sheet-pan sweets you can cut and share.",
    group: "desserts",
  },
  {
    slug: "desserts",
    name: "Desserts",
    description: "Cobblers, cakes, cookies, and citrus bars.",
    group: "course",
  },
  {
    slug: "breakfast",
    name: "Breakfast",
    description: "Morning plates that work on a weekday.",
    group: "course",
  },
  {
    slug: "breads",
    name: "Breads",
    description: "Focaccia and everyday loaves from the studio oven.",
    group: "course",
  },
  {
    slug: "main-dishes",
    name: "Main Dishes",
    description: "Roasts, pots of chile, and weeknight plates.",
    group: "course",
  },
  {
    slug: "side-dishes",
    name: "Side Dishes",
    description: "Vegetables and extras that hold their own.",
    group: "course",
  },
  {
    slug: "drinks",
    name: "Drinks",
    description: "Iced coffee, aguas, and something cold for the porch.",
    group: "course",
  },
  {
    slug: "toppings",
    name: "Toppings & Condiments",
    description: "Salsas and sauces that finish a plate.",
    group: "course",
  },
  {
    slug: "oven",
    name: "Oven",
    description: "Roasts, bakes, and sheet-pan cooking.",
    group: "method",
  },
  {
    slug: "stovetop",
    name: "Stovetop",
    description: "Pots, skillets, and one-burner dinners.",
    group: "method",
  },
  {
    slug: "no-bake",
    name: "No Bake",
    description: "Cold drinks and condiments that skip the oven.",
    group: "method",
  },
  {
    slug: "summer",
    name: "Summer",
    description: "Stone fruit, citrus, and porch-weather cooking.",
    group: "holiday",
  },
  {
    slug: "weekend",
    name: "Weekend",
    description: "Projects worth a slower morning.",
    group: "holiday",
  },
];

export const megaMenu = [
  {
    label: "Desserts",
    slugs: ["cakes", "cookies", "brownies-bars", "desserts"],
  },
  {
    label: "Course",
    slugs: ["breakfast", "breads", "main-dishes", "side-dishes", "drinks", "toppings"],
  },
  {
    label: "Method",
    slugs: ["oven", "stovetop", "no-bake"],
  },
  {
    label: "Season",
    slugs: ["summer", "weekend"],
  },
] as const;
