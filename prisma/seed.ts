import { PrismaClient } from "@prisma/client";
import { categories } from "../src/data/categories";
import { recipes } from "../src/data/recipes";
import { CORE_FIELDS, type FieldDefinition } from "../src/lib/fields";
import { recipeToValues } from "../src/lib/recipe-map";

const prisma = new PrismaClient();

const extraByType: Record<string, FieldDefinition> = {
  cake: { key: "frostingNotes", label: "Frosting notes", kind: "textarea" },
  cookie: { key: "chillHours", label: "Chill hours", kind: "number" },
  dessert: { key: "serveWith", label: "Serve with", kind: "text" },
  drink: { key: "glassware", label: "Glassware", kind: "text" },
  main: { key: "protein", label: "Main protein", kind: "text" },
  bread: { key: "riseHours", label: "Rise hours", kind: "number" },
  condiment: { key: "storageNotes", label: "Storage notes", kind: "textarea" },
  breakfast: { key: "servingStyle", label: "Serving style", kind: "text" },
  side: { key: "pairing", label: "Pairs well with", kind: "text" },
};

const typeMeta = [
  { slug: "cake", name: "Cake", description: "Loaves, layers, and cupcakes." },
  { slug: "cookie", name: "Cookie", description: "Drop cookies and tin sweets." },
  { slug: "dessert", name: "Dessert", description: "Cobblers, bars, and other sweets." },
  { slug: "drink", name: "Drink", description: "Coffee, aguas, and cold glasses." },
  { slug: "main", name: "Main", description: "Dinners and center-of-the-table plates." },
  { slug: "bread", name: "Bread", description: "Focaccia and everyday loaves." },
  { slug: "condiment", name: "Condiment", description: "Salsas, sauces, and toppings." },
  { slug: "breakfast", name: "Breakfast", description: "Morning plates." },
  { slug: "side", name: "Side", description: "Vegetables and extras." },
];

function typeForRecipe(categorySlugs: string[]) {
  if (categorySlugs.includes("cakes")) return "cake";
  if (categorySlugs.includes("cookies")) return "cookie";
  if (categorySlugs.includes("drinks")) return "drink";
  if (categorySlugs.includes("breads")) return "bread";
  if (categorySlugs.includes("toppings")) return "condiment";
  if (categorySlugs.includes("side-dishes")) return "side";
  if (categorySlugs.includes("main-dishes")) return "main";
  if (categorySlugs.includes("breakfast")) return "breakfast";
  return "dessert";
}

async function main() {
  await prisma.recipeCategory.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.recipeTypeField.deleteMany();
  await prisma.recipeType.deleteMany();
  await prisma.category.deleteMany();

  for (const category of categories) {
    await prisma.category.create({
      data: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        group: category.group,
      },
    });
  }

  for (const type of typeMeta) {
    const extra = extraByType[type.slug];
    const fields = extra ? [...CORE_FIELDS, extra] : CORE_FIELDS;
    await prisma.recipeType.create({
      data: {
        slug: type.slug,
        name: type.name,
        description: type.description,
        fields: {
          create: fields.map((field, index) => ({
            key: field.key,
            label: field.label,
            helpText: field.helpText || "",
            kind: field.kind,
            required: Boolean(field.required),
            options: JSON.stringify(field.options || []),
            sortOrder: index,
          })),
        },
      },
    });
  }

  const dbTypes = await prisma.recipeType.findMany();
  const dbCategories = await prisma.category.findMany();

  for (const recipe of recipes) {
    const typeSlug = typeForRecipe(recipe.categories);
    const type = dbTypes.find((item) => item.slug === typeSlug);
    if (!type) continue;

    await prisma.recipe.create({
      data: {
        slug: recipe.slug,
        title: recipe.title,
        excerpt: recipe.excerpt,
        typeId: type.id,
        status: "published",
        featured: Boolean(recipe.featured),
        seasonal: Boolean(recipe.seasonal),
        publishedAt: new Date(recipe.publishedAt),
        values: JSON.stringify(recipeToValues(recipe)),
        categories: {
          create: recipe.categories
            .map((slug) => dbCategories.find((category) => category.slug === slug))
            .filter((category): category is (typeof dbCategories)[number] => Boolean(category))
            .map((category) => ({ categoryId: category.id })),
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
