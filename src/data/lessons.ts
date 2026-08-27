import type { Lesson } from "./types";

export const STUDIO_LESSON_CATEGORY = "Technique";

export const lessons: Lesson[] = [
  {
    slug: "how-to-measure",
    title: "How to measure ingredients correctly",
    excerpt:
      "A scale is kinder than a scoop. Here is how we measure in the studio so cakes stay tender.",
    featured: true,
    relatedRecipeSlugs: ["chocolate-chunk-cookies", "weeknight-chile"],
    body: [
      "Most dry-cake failures start with too much flour. Scoops packed against the bag can add 30 grams without you noticing, which is enough to turn a tender crumb tight and dry.",
      "Weigh flour, sugar, and liquids whenever you can. If you do not have a scale, fluff the flour in the container, spoon it into the cup, and level with a straight edge. Do not tap the cup on the counter.",
      "Brown sugar is the exception: pack it firmly so it holds the cup’s shape. Baking powder, soda, and salt should be leveled, not heaped.",
      "For liquids, set the measuring cup on the counter and read at eye level. For sticky things like honey or olive oil, lightly oil the cup first so it releases cleanly.",
    ],
  },
  {
    slug: "salted-vs-unsalted-butter",
    title: "Salted vs. unsalted butter",
    excerpt: "We bake with unsalted butter so we can season the recipe ourselves.",
    relatedRecipeSlugs: ["chocolate-chunk-cookies"],
    body: [
      "Unsalted butter is the studio default. Salt content in salted butter varies by brand, and that swing is enough to throw off cookies and buttercream.",
      "If salted is what you have, drop the added salt in the recipe by about ¼ teaspoon per stick (113g) of butter. Taste frostings and doughs before you commit.",
      "For finishing — warm bread, roasted vegetables, a skillet of eggs — salted butter is welcome. Use it where you would reach for a finishing flake of salt.",
      "Temperature matters more than the label. Recipes that say room temperature mean the stick should give slightly when pressed, not melt into a puddle.",
    ],
  },
  {
    slug: "knowing-your-oven",
    title: "Knowing your oven",
    excerpt: "Ovens lie. An inexpensive thermometer is the most useful tool on the studio shelf.",
    relatedRecipeSlugs: ["chocolate-chunk-cookies"],
    body: [
      "Home ovens routinely run 15 to 25 degrees off the dial. That is the difference between a pale cookie and a bitter edge.",
      "Place an oven thermometer on the center rack and preheat a full 20 minutes. Note whether your oven runs hot or cool and adjust recipes accordingly.",
      "Bake in the middle unless a recipe says otherwise. Dark pans brown faster; glass holds heat longer after you pull the dish. If you switch pans, start checking a few minutes early.",
      "Resist opening the door in the first two-thirds of a bake. Heat dumps out, cakes sink, and pastry stops rising. Use the oven light.",
    ],
  },
  {
    slug: "mise-en-place",
    title: "Mise en place: cooking without the scramble",
    excerpt: "Read the recipe once. Set the station. Then turn on the heat.",
    relatedRecipeSlugs: ["weeknight-chile", "salsa-verde"],
    body: [
      "Mise en place is just a habit: gather, measure, and place everything before the first onion hits the pan. It is how we keep weeknight cooking calm.",
      "Read the whole recipe first, including the notes. Preheat the oven, then chop, measure, and line up bowls in the order you will use them.",
      "Group ingredients that go in together — dry mix in one bowl, wet in another. Put trash and compost within reach so the board stays clear.",
      "When the cooking starts, you should only be stirring, tasting, and watching. That is when good timing happens.",
    ],
  },
];

export function lessonHref(slug: string) {
  return `/studio/${slug}`;
}

export function partitionStudioLessons(allLessons: Lesson[] = lessons) {
  const featured = allLessons.find((lesson) => lesson.featured) ?? allLessons[0]!;
  const notes = allLessons.filter((lesson) => lesson.slug !== featured.slug);
  return { featured, notes };
}
