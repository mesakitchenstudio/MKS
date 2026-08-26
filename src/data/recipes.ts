import type { Recipe } from "./types";
import { SALSA_VERDE_YOUTUBE } from "./sample-youtube";

export const recipes: Recipe[] = [
  {
    slug: "citrus-olive-oil-cake",
    title: "Citrus Olive Oil Cake",
    excerpt: "A tender, sun-yellow loaf scented with orange zest and good olive oil.",
    intro:
      "This is the cake we bake when someone is coming over and the fruit bowl is full of oranges. Olive oil keeps the crumb moist for days, and a warm citrus glaze soaks in while the loaf is still hot from the oven.",
    whyItWorks:
      "Olive oil cakes do not rely on creaming butter for lift. The oil coats the flour so gluten stays relaxed, and a mix of orange zest, juice, and a pinch of cardamom reads as perfume rather than punch. Baking it in a loaf pan gives you a tight, sliceable crumb that still feels like cake.",
    keyIngredients: [
      {
        name: "Extra-virgin olive oil",
        note: "Use one you like on salad. A grassy, peppery oil becomes the flavor of the cake.",
      },
      {
        name: "Oranges",
        note: "Zest first, then juice. The oils in the peel do most of the work.",
      },
      {
        name: "Whole-milk yogurt",
        note: "Adds gentle acidity so the crumb stays tender instead of oily.",
      },
    ],
    tips: [
      "Rub the zest into the sugar with your fingers until it smells like a peeled orange. That one step is the difference between a hint of citrus and a cake that tastes like citrus.",
      "Let the glaze soak in while the cake is warm, then cool completely before slicing. Warm slices crumble.",
      "The cake is better on day two. Wrap it tightly once cool.",
    ],
    faqs: [
      {
        question: "Can I use lemon instead of orange?",
        answer:
          "Yes. Use the zest of two lemons and ⅓ cup juice. The cake will be brighter and a little more tart; a spoon of honey in the glaze balances it.",
      },
      {
        question: "What olive oil should I buy?",
        answer:
          "A fresh extra-virgin oil you would put on tomatoes. Avoid light or refined oil — the cake will taste flat.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "A sliced citrus loaf cake on a ceramic plate",
    publishedAt: "2026-03-12",
    updatedAt: "2026-08-18",
    prepMinutes: 20,
    cookMinutes: 50,
    servings: 10,
    servingsUnit: "slices",
    course: "Dessert",
    method: "Oven",
    holiday: "Summer",
    cuisine: "Mediterranean",
    categories: ["cakes", "desserts", "oven", "summer"],
    tags: ["cake", "citrus", "olive oil", "baking"],
    featured: true,
    seasonal: true,
    ingredients: [
      {
        items: [
          { item: "granulated sugar", amount: "1 cup", grams: 200 },
          { item: "orange zest", amount: "2 tablespoons", notes: "from 2 oranges" },
          { item: "large eggs", amount: "3", notes: "room temperature" },
          { item: "extra-virgin olive oil", amount: "¾ cup", grams: 165 },
          { item: "whole-milk yogurt", amount: "½ cup", grams: 120 },
          { item: "fresh orange juice", amount: "⅓ cup", grams: 80 },
          { item: "all-purpose flour", amount: "1½ cups", grams: 180 },
          { item: "baking powder", amount: "1½ teaspoons" },
          { item: "fine sea salt", amount: "½ teaspoon" },
          { item: "ground cardamom", amount: "¼ teaspoon" },
        ],
      },
      {
        name: "Glaze",
        items: [
          { item: "powdered sugar", amount: "¾ cup", grams: 90 },
          { item: "fresh orange juice", amount: "2 tablespoons" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Heat the oven to 350°F (175°C). Butter a 9×5-inch loaf pan and line it with a parchment sling.",
          "In a large bowl, rub the sugar and orange zest together until the sugar is damp and fragrant. Whisk in the eggs, then the olive oil, yogurt, and orange juice until smooth.",
          "Whisk the flour, baking powder, salt, and cardamom in a second bowl. Fold the dry ingredients into the wet just until no dry streaks remain.",
          "Pour into the pan and bake 45 to 55 minutes, until a tester comes out with a few moist crumbs. Cool in the pan 15 minutes.",
          "Stir the glaze until thick but pourable. Lift the cake out, spoon the glaze over the warm top, and cool completely before slicing.",
        ],
      },
    ],
    notes: [
      "A 9-inch round cake pan also works; start checking at 35 minutes.",
      "Store wrapped at room temperature for 3 days, or freeze slices for a month.",
    ],
    nutrition: { calories: 312, carbs: 38, protein: 5, fat: 16, sugar: 22 },
  },
  {
    slug: "chile-honey-roasted-chicken",
    title: "Chile-Honey Roasted Chicken",
    excerpt: "A weeknight roast with sticky edges, citrus, and a gentle chile heat.",
    intro:
      "This chicken is what we make when we want the table to feel looked after without spending the afternoon on it. Honey and crushed chile cling to the skin; orange and garlic perfume the pan juices, which become the sauce.",
    whyItWorks:
      "Starting the bird on a preheated sheet pan gives the underside a head start. Honey wants to burn, so we glaze in the last 20 minutes. A small amount of vinegar in the glaze keeps the sweetness from going candy-like.",
    keyIngredients: [
      {
        name: "Bone-in chicken thighs",
        note: "Skin-on thighs stay juicy and give you those lacquered edges. Breasts dry out before the glaze sets.",
      },
      {
        name: "Chile flakes",
        note: "Aleppo or crushed red pepper. Aleppo is fruitier; red pepper is sharper.",
      },
      {
        name: "Orange",
        note: "Juice for the glaze, wedges in the pan for roasting alongside.",
      },
    ],
    tips: [
      "Pat the chicken very dry. Moisture is the enemy of browned skin.",
      "If the glaze darkens too fast, tent loosely with foil for the last 10 minutes.",
      "Rest 10 minutes so the juices settle. Spoon the pan sauce over rice or warm tortillas.",
    ],
    faqs: [
      {
        question: "Can I use a whole chicken?",
        answer:
          "Yes. Spatchcock a 4-pound bird, roast at 425°F for about 45 minutes, and glaze in the last 15. Confirm 165°F at the thigh.",
      },
      {
        question: "How spicy is it?",
        answer:
          "Warm, not fiery. Cut the chile in half for kids, or finish adult plates with extra flakes.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "Roasted chicken pieces with herbs on a serving platter",
    publishedAt: "2026-02-08",
    updatedAt: "2026-08-10",
    prepMinutes: 15,
    cookMinutes: 40,
    servings: 4,
    servingsUnit: "servings",
    course: "Main",
    method: "Oven",
    cuisine: "Southwestern",
    categories: ["main-dishes", "oven", "weekend"],
    tags: ["chicken", "dinner", "chile", "honey"],
    featured: true,
    ingredients: [
      {
        items: [
          { item: "bone-in, skin-on chicken thighs", amount: "2½ pounds", grams: 1130 },
          { item: "kosher salt", amount: "1½ teaspoons" },
          { item: "black pepper", amount: "1 teaspoon" },
          { item: "olive oil", amount: "1 tablespoon" },
          { item: "honey", amount: "3 tablespoons" },
          { item: "orange juice", amount: "2 tablespoons" },
          { item: "apple cider vinegar", amount: "1 tablespoon" },
          { item: "Aleppo pepper or red chile flakes", amount: "1 teaspoon" },
          { item: "garlic cloves", amount: "4", notes: "smashed" },
          { item: "orange", amount: "1", notes: "cut into wedges" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Heat the oven to 425°F (220°C) with a rimmed sheet pan inside.",
          "Pat the chicken dry and season all over with salt and pepper. Toss with the olive oil.",
          "Arrange skin-side up on the hot pan with the garlic and orange wedges. Roast 20 minutes.",
          "Stir the honey, orange juice, vinegar, and chile. Brush over the chicken and roast 15 to 20 minutes more, until the skin is lacquered and the thickest thigh reads 175°F.",
          "Rest 10 minutes. Spoon the pan juices over the chicken and serve.",
        ],
      },
    ],
    notes: [
      "Thighs are done and still juicy at 175°F. Breasts should stop at 160°F and rest.",
      "Leftovers make excellent next-day tacos with salsa verde.",
    ],
    nutrition: { calories: 420, carbs: 12, protein: 32, fat: 27 },
  },
  {
    slug: "peach-skillet-cobbler",
    title: "Peach Skillet Cobbler",
    excerpt: "Jammy summer peaches under a buttery, drop-biscuit lid.",
    intro:
      "When peaches are heavy and fragrant, this is the dessert we make in one skillet. The fruit collapses into its own syrup; the biscuit topping stays tender underneath and crisp at the edges.",
    whyItWorks:
      "A hot skillet gives the peaches a head start so they do not waterlog the dough. Cornstarch thickens just enough juice to spoon over, and buttermilk in the biscuits keeps them from turning cakey.",
    keyIngredients: [
      {
        name: "Ripe peaches",
        note: "They should smell like peaches from a foot away. Frozen sliced peaches work in winter; do not thaw first.",
      },
      {
        name: "Buttermilk",
        note: "Acidity tenderizes the biscuit. Whole milk plus a teaspoon of lemon juice is a fine stand-in.",
      },
    ],
    tips: [
      "Leave some peach pieces in larger chunks so you get both jam and fruit.",
      "The cobbler is ready when the juices bubble thickly around the biscuits, not just when the top looks brown.",
      "Serve warm with cold cream or vanilla ice cream. Room-temperature cobbler is still excellent at breakfast.",
    ],
    faqs: [
      {
        question: "Can I use nectarines or plums?",
        answer:
          "Yes. Nectarines need no peel. Plums are tarter — add an extra tablespoon of sugar.",
      },
      {
        question: "Do I have to peel the peaches?",
        answer:
          "No. The skins soften and add color. Peel if the skins are tough or you want a smoother spoonful.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1464305795204-6f5bbfc7fb81?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "A rustic fruit cobbler in a skillet",
    publishedAt: "2026-06-02",
    updatedAt: "2026-08-20",
    prepMinutes: 20,
    cookMinutes: 35,
    servings: 8,
    servingsUnit: "servings",
    course: "Dessert",
    method: "Oven",
    holiday: "Summer",
    cuisine: "American",
    categories: ["desserts", "oven", "summer"],
    tags: ["peach", "cobbler", "summer", "baking"],
    featured: true,
    seasonal: true,
    ingredients: [
      {
        name: "Filling",
        items: [
          { item: "ripe peaches", amount: "2 pounds", grams: 900, notes: "sliced" },
          { item: "granulated sugar", amount: "⅓ cup", grams: 65 },
          { item: "cornstarch", amount: "1 tablespoon" },
          { item: "lemon juice", amount: "1 tablespoon" },
          { item: "vanilla extract", amount: "1 teaspoon" },
          { item: "kosher salt", amount: "1 pinch" },
        ],
      },
      {
        name: "Biscuit topping",
        items: [
          { item: "all-purpose flour", amount: "1¼ cups", grams: 150 },
          { item: "granulated sugar", amount: "3 tablespoons" },
          { item: "baking powder", amount: "1½ teaspoons" },
          { item: "kosher salt", amount: "½ teaspoon" },
          { item: "cold unsalted butter", amount: "6 tablespoons", grams: 85, notes: "cubed" },
          { item: "buttermilk", amount: "½ cup", grams: 120 },
          { item: "turbinado sugar", amount: "1 tablespoon", notes: "for sprinkling" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Heat the oven to 375°F (190°C). Set a 10-inch oven-safe skillet over medium heat.",
          "Toss the peaches with sugar, cornstarch, lemon juice, vanilla, and salt. Cook in the skillet 4 to 5 minutes, until the juices look glossy.",
          "Pulse or rub the flour, sugar, baking powder, salt, and butter until pea-sized crumbs form. Stir in the buttermilk just until a shaggy dough comes together.",
          "Drop spoonfuls of dough over the fruit, leaving gaps. Sprinkle with turbinado sugar.",
          "Bake 30 to 35 minutes, until the topping is golden and the juices bubble thickly. Rest 15 minutes before serving.",
        ],
      },
    ],
    notes: [
      "A 2-quart baking dish works if you do not have a skillet; warm the filling on the stove first.",
    ],
    nutrition: { calories: 286, carbs: 44, protein: 4, fat: 11, sugar: 26 },
  },
  {
    slug: "breakfast-tortillas",
    title: "Breakfast Tortillas",
    excerpt: "Soft scrambled eggs, salsa verde, and a warm tortilla — breakfast in ten minutes.",
    intro:
      "This is the Mesa breakfast: eggs cooked slowly until they just set, tucked into a warm tortilla with salsa, cheese, and whatever herbs are on the board. It is not a burrito. It is a plate you can eat with one hand on a weekday.",
    whyItWorks:
      "Low heat keeps the eggs custardy instead of rubbery. Warming the tortillas in a dry skillet makes them pliable so they do not crack. Salsa verde cuts the richness; a little cheese melts into the eggs and holds the fold.",
    keyIngredients: [
      {
        name: "Corn or flour tortillas",
        note: "Corn is our preference. Flour is softer and more forgiving if you are packing them to go.",
      },
      {
        name: "Eggs",
        note: "Room-temperature eggs scramble more evenly. Two per person is plenty with fillings.",
      },
    ],
    tips: [
      "Pull the eggs from the pan while they still look slightly wet. They finish on the tortilla.",
      "Keep a stack of tortillas wrapped in a clean towel so they stay steamy.",
      "Leftover roasted chicken or beans turn this into lunch.",
    ],
    faqs: [
      {
        question: "Can I make these ahead?",
        answer:
          "Warm the tortillas and prep salsa and cheese ahead. Scramble the eggs to order — they do not reheat well.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "Breakfast tacos with salsa on a plate",
    publishedAt: "2026-01-20",
    updatedAt: "2026-07-22",
    prepMinutes: 10,
    cookMinutes: 10,
    servings: 2,
    servingsUnit: "servings",
    course: "Breakfast",
    method: "Stovetop",
    cuisine: "Southwestern",
    categories: ["breakfast", "stovetop"],
    tags: ["eggs", "breakfast", "tortillas", "quick"],
    featured: true,
    ingredients: [
      {
        items: [
          { item: "large eggs", amount: "4" },
          { item: "kosher salt", amount: "½ teaspoon" },
          { item: "unsalted butter", amount: "1 tablespoon" },
          { item: "corn or flour tortillas", amount: "4", notes: "warmed" },
          { item: "shredded Monterey Jack or queso fresco", amount: "½ cup", grams: 55 },
          { item: "salsa verde", amount: "⅓ cup" },
          { item: "cilantro leaves", amount: "a handful" },
          { item: "lime wedges", amount: "for serving" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Beat the eggs with the salt until no streaks of white remain.",
          "Warm the tortillas in a dry skillet over medium heat, 20 to 30 seconds a side. Wrap in a towel.",
          "Melt the butter in the same skillet over low heat. Add the eggs and stir slowly with a spatula, sweeping the bottom, until just set and still glossy, 3 to 4 minutes.",
          "Divide eggs among tortillas. Add cheese, salsa verde, and cilantro. Fold and serve with lime.",
        ],
      },
    ],
    notes: ["Use the studio salsa verde, or a good jarred tomatillo salsa in a pinch."],
    nutrition: { calories: 390, carbs: 28, protein: 22, fat: 21 },
  },
  {
    slug: "chocolate-chunk-cookies",
    title: "Chocolate Chunk Cookies",
    excerpt: "Thick, bronzed cookies with puddles of dark chocolate and a salt finish.",
    intro:
      "These are the cookies we keep in the studio tin. Brown sugar does the chew, a rest in the fridge deepens the flavor, and chopping a bar yourself gives you those irregular pools instead of tidy chips.",
    whyItWorks:
      "Melted butter plus a chill is our path to a cookie that spreads just enough. Bread flour is optional but adds chew. Baking until the edges are set and the centers look slightly underdone is the whole game.",
    keyIngredients: [
      {
        name: "Dark chocolate bar",
        note: "60 to 70 percent cacao, chopped. Chips will work; they will not puddle the same way.",
      },
      {
        name: "Dark brown sugar",
        note: "Moisture and molasses flavor. Light brown sugar makes a slightly crisper cookie.",
      },
    ],
    tips: [
      "Chill the dough at least 2 hours, overnight if you can. Unchilled dough spreads into thin wafers.",
      "A flaky salt finish is not optional in this kitchen. Add it the second the cookies leave the oven.",
      "For even cookies, scoop, then roll each portion into a rough ball and press a few extra chocolate shards on top.",
    ],
    faqs: [
      {
        question: "Can I freeze the dough?",
        answer:
          "Yes. Freeze scooped balls, then bake from frozen at 350°F, adding 2 extra minutes.",
      },
      {
        question: "Why did my cookies go flat?",
        answer:
          "Butter was too warm or the dough skipped the chill. Next batch, chill longer and check that your baking soda is fresh.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "Chocolate chip cookies stacked on parchment",
    publishedAt: "2026-04-04",
    updatedAt: "2026-08-14",
    prepMinutes: 20,
    cookMinutes: 12,
    servings: 18,
    servingsUnit: "cookies",
    course: "Dessert",
    method: "Oven",
    holiday: "Weekend",
    cuisine: "American",
    categories: ["cookies", "desserts", "oven", "weekend"],
    tags: ["cookies", "chocolate", "baking"],
    featured: true,
    ingredients: [
      {
        items: [
          { item: "unsalted butter", amount: "¾ cup", grams: 170, notes: "melted and cooled 10 minutes" },
          { item: "packed dark brown sugar", amount: "¾ cup", grams: 165 },
          { item: "granulated sugar", amount: "¼ cup", grams: 50 },
          { item: "large egg", amount: "1", notes: "room temperature" },
          { item: "egg yolk", amount: "1" },
          { item: "vanilla extract", amount: "2 teaspoons" },
          { item: "all-purpose flour", amount: "1¾ cups", grams: 210 },
          { item: "baking soda", amount: "¾ teaspoon" },
          { item: "kosher salt", amount: "¾ teaspoon" },
          { item: "dark chocolate", amount: "6 ounces", grams: 170, notes: "chopped" },
          { item: "flaky sea salt", amount: "for finishing" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Whisk the melted butter with both sugars until glossy. Whisk in the egg, yolk, and vanilla.",
          "Stir in the flour, baking soda, and salt just until combined. Fold in the chocolate. Cover and chill at least 2 hours.",
          "Heat the oven to 350°F (175°C). Line two sheets with parchment. Scoop 2-tablespoon balls, spacing them 2 inches apart.",
          "Bake 11 to 13 minutes, until the edges are bronze and the centers look just set. Sprinkle with flaky salt.",
          "Cool on the sheet 5 minutes, then move to a rack.",
        ],
      },
    ],
    notes: [
      "Dough keeps 3 days in the fridge. Flavor improves after the first night.",
    ],
    nutrition: { calories: 198, carbs: 24, protein: 2, fat: 11, sugar: 15 },
  },
  {
    slug: "lemon-sesame-bars",
    title: "Lemon Sesame Bars",
    excerpt: "A shortbread base, sharp lemon curd, and a toasted sesame finish.",
    intro:
      "Lemon bars belong in every studio tin, but we fold toasted sesame into the crust and shower the top with more after the curd sets. The nuttiness makes the citrus taste cleaner, not sweeter.",
    whyItWorks:
      "Blind-baking the crust keeps it from turning soggy under the curd. A mix of whole eggs and yolks sets glossy, not rubbery. Sesame oil is too strong here — toasted seeds are enough.",
    keyIngredients: [
      {
        name: "Lemons",
        note: "Fresh juice only. Bottled juice tastes dull and slightly bitter.",
      },
      {
        name: "Sesame seeds",
        note: "Toast them in a dry pan until they smell like tahini, then cool before grinding into the crust.",
      },
    ],
    tips: [
      "Zest before you juice. It is nearly impossible the other way around.",
      "Cool the bars completely, then chill 2 hours before cutting. Warm lemon bars smear.",
      "Wipe the knife between cuts for clean squares.",
    ],
    faqs: [
      {
        question: "Can I skip the sesame?",
        answer:
          "Yes. The crust becomes a classic shortbread. Add a pinch of salt to the curd so it does not taste one-note.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1519915028121-7d3463d20b13?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "Lemon dessert bars cut into squares",
    publishedAt: "2026-05-11",
    updatedAt: "2026-08-12",
    prepMinutes: 25,
    cookMinutes: 40,
    servings: 16,
    servingsUnit: "bars",
    course: "Dessert",
    method: "Oven",
    holiday: "Summer",
    cuisine: "American",
    categories: ["brownies-bars", "desserts", "oven", "summer"],
    tags: ["lemon", "bars", "sesame", "baking"],
    seasonal: true,
    ingredients: [
      {
        name: "Crust",
        items: [
          { item: "all-purpose flour", amount: "1 cup", grams: 120 },
          { item: "powdered sugar", amount: "⅓ cup", grams: 40 },
          { item: "toasted sesame seeds", amount: "3 tablespoons", notes: "plus more for topping" },
          { item: "kosher salt", amount: "¼ teaspoon" },
          { item: "cold unsalted butter", amount: "8 tablespoons", grams: 113, notes: "cubed" },
        ],
      },
      {
        name: "Lemon layer",
        items: [
          { item: "granulated sugar", amount: "1 cup", grams: 200 },
          { item: "lemon zest", amount: "1 tablespoon" },
          { item: "all-purpose flour", amount: "2 tablespoons" },
          { item: "large eggs", amount: "3" },
          { item: "egg yolks", amount: "2" },
          { item: "fresh lemon juice", amount: "⅔ cup", grams: 160 },
          { item: "powdered sugar", amount: "for dusting" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Heat the oven to 350°F (175°C). Line an 8-inch square pan with a parchment sling.",
          "Pulse the crust ingredients until sandy and starting to clump. Press firmly into the pan. Bake 18 to 20 minutes, until the edges are pale gold.",
          "Rub the sugar and zest together. Whisk in the flour, eggs, yolks, and lemon juice until smooth.",
          "Pour over the hot crust. Bake 18 to 22 minutes more, until the center barely jiggles.",
          "Cool, then chill 2 hours. Dust with powdered sugar, scatter sesame seeds, and cut into 16 bars.",
        ],
      },
    ],
    notes: ["Bars keep refrigerated up to 4 days."],
    nutrition: { calories: 168, carbs: 22, protein: 3, fat: 8, sugar: 16 },
  },
  {
    slug: "weeknight-chile",
    title: "Weeknight Chile",
    excerpt: "A pot of chile that tastes like it simmered all day, ready in under an hour.",
    intro:
      "This is the chile we make on a Tuesday: toasted spices, a mix of beans, and enough tomato to make it spoonable over rice or cornbread. It is not competition chile. It is supper.",
    whyItWorks:
      "Browning the onion and tomato paste until they darken is where the long-simmered flavor comes from. A splash of coffee or cocoa is optional but rounds the spice. Beans go in with their liquid so the pot stays silky.",
    keyIngredients: [
      {
        name: "Tomato paste",
        note: "Cook it in the oil until it turns brick red. Raw paste tastes metallic.",
      },
      {
        name: "Chile powder",
        note: "A blend, not cayenne. We like a mix of ancho and a little chipotle.",
      },
    ],
    tips: [
      "Salt in layers: onions, then tomatoes, then a final taste at the end.",
      "The chile is better the next day. Cool, refrigerate, and reheat gently with a splash of water.",
      "Set out bowls of cilantro, lime, cheese, and pickled onion so everyone builds a plate.",
    ],
    faqs: [
      {
        question: "Can I add meat?",
        answer:
          "Brown a pound of ground beef or turkey after the onions, then continue. You may want an extra ½ cup broth.",
      },
      {
        question: "Is it very spicy?",
        answer:
          "No. Chipotle adds smoke more than heat. Add a minced jalapeño with the onion if you want more.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1455619455610-8d264be79813?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "A bowl of chile with toppings",
    publishedAt: "2026-01-09",
    updatedAt: "2026-07-30",
    prepMinutes: 15,
    cookMinutes: 40,
    servings: 6,
    servingsUnit: "servings",
    course: "Main",
    method: "Stovetop",
    cuisine: "Southwestern",
    categories: ["main-dishes", "stovetop"],
    tags: ["chile", "beans", "dinner", "weeknight"],
    ingredients: [
      {
        items: [
          { item: "olive oil", amount: "2 tablespoons" },
          { item: "yellow onion", amount: "1 large", notes: "diced" },
          { item: "garlic cloves", amount: "4", notes: "minced" },
          { item: "tomato paste", amount: "2 tablespoons" },
          { item: "chile powder", amount: "2 tablespoons" },
          { item: "ground cumin", amount: "2 teaspoons" },
          { item: "dried oregano", amount: "1 teaspoon" },
          { item: "kosher salt", amount: "1½ teaspoons" },
          { item: "crushed tomatoes", amount: "1 can (28 ounces)" },
          { item: "black beans", amount: "1 can (15 ounces)", notes: "with liquid" },
          { item: "pinto beans", amount: "1 can (15 ounces)", notes: "with liquid" },
          { item: "water or broth", amount: "1 cup" },
          { item: "unsweetened cocoa powder", amount: "1 teaspoon", notes: "optional" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Warm the oil in a heavy pot over medium heat. Cook the onion with a pinch of salt until soft and golden at the edges, 8 minutes. Stir in the garlic for 30 seconds.",
          "Add the tomato paste, chile powder, cumin, and oregano. Cook, stirring, 2 minutes, until the paste darkens.",
          "Pour in the tomatoes, beans with their liquid, water, cocoa, and remaining salt. Bring to a simmer.",
          "Cook uncovered 25 to 30 minutes, stirring now and then, until the chile is thick and glossy. Taste for salt.",
          "Serve with rice, cornbread, or warm tortillas.",
        ],
      },
    ],
    notes: ["Freezes well for 2 months. Thaw overnight in the fridge."],
    nutrition: { calories: 248, carbs: 38, protein: 12, fat: 6, fiber: 11 },
  },
  {
    slug: "herb-focaccia",
    title: "Herb Focaccia",
    excerpt: "A dimpled, olive-oil bread with rosemary and flaky salt — weekend baking at an easy pace.",
    intro:
      "Focaccia is the bread we teach first. The dough is wet on purpose, the timeline is flexible, and the olive oil does half the work. You end up with a pan of bread that is crisp at the edges and almost custardy inside.",
    whyItWorks:
      "A long, cool rise develops flavor without kneading. Plenty of oil in the pan fries the bottom as it bakes. Deep dimples keep the dough from puffing into a loaf and make little wells for herbs and salt.",
    keyIngredients: [
      {
        name: "Bread flour",
        note: "Higher protein gives you those stretchy, glossy holes. All-purpose works; the crumb will be a bit tighter.",
      },
      {
        name: "Olive oil",
        note: "Do not be shy. The pan should look generously slick before the dough goes in.",
      },
    ],
    tips: [
      "Wet hands to fold and dimple. Dry hands will tear the dough.",
      "If the dough fights you, wait 10 minutes. Relaxed gluten stretches.",
      "Day-old focaccia makes the best sandwich bread. Split it horizontally.",
    ],
    faqs: [
      {
        question: "Can I make it the same day?",
        answer:
          "Yes. Do the first rise at room temperature for 1½ hours, then proceed. Flavor is a little quieter.",
      },
      {
        question: "Why is my focaccia dense?",
        answer:
          "The dough was under-hydrated or under-proofed. It should look jiggly and doubled before it goes in the oven.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "Golden focaccia bread on a board",
    publishedAt: "2026-03-28",
    updatedAt: "2026-08-08",
    prepMinutes: 25,
    cookMinutes: 25,
    servings: 12,
    servingsUnit: "squares",
    course: "Bread",
    method: "Oven",
    holiday: "Weekend",
    cuisine: "Italian",
    categories: ["breads", "breakfast", "oven", "weekend"],
    tags: ["bread", "focaccia", "olive oil", "weekend"],
    ingredients: [
      {
        items: [
          { item: "warm water", amount: "1½ cups", grams: 360, notes: "about 95°F" },
          { item: "instant yeast", amount: "2 teaspoons" },
          { item: "honey", amount: "1 teaspoon" },
          { item: "bread flour", amount: "3¼ cups", grams: 390 },
          { item: "kosher salt", amount: "1½ teaspoons" },
          { item: "extra-virgin olive oil", amount: "¼ cup", grams: 55, notes: "plus more for the pan" },
          { item: "fresh rosemary", amount: "2 tablespoons", notes: "chopped" },
          { item: "flaky sea salt", amount: "for finishing" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Stir the water, yeast, and honey in a large bowl. Add the flour and kosher salt and mix until no dry flour remains. The dough will be sticky.",
          "Drizzle 1 tablespoon olive oil over the dough, cover, and refrigerate 8 to 24 hours, until doubled and bubbly.",
          "Pour 2 tablespoons oil into a 9×13-inch pan. Turn the dough into the pan and fold it over itself once or twice with oiled hands. Rest 30 minutes, then stretch it toward the corners. Rest another 30 to 45 minutes.",
          "Heat the oven to 425°F (220°C). Dimple the dough deeply with oiled fingertips. Drizzle with the remaining oil, rosemary, and flaky salt.",
          "Bake 22 to 26 minutes, until deeply golden. Cool in the pan 10 minutes, then lift out and tear or slice.",
        ],
      },
    ],
    notes: [
      "Cherry tomatoes or thin lemon slices can go in the dimples before baking.",
    ],
    nutrition: { calories: 186, carbs: 30, protein: 5, fat: 5 },
  },
  {
    slug: "vanilla-bean-cupcakes",
    title: "Vanilla Bean Cupcakes",
    excerpt: "Soft vanilla cupcakes with a plush crumb and a swirl of buttercream.",
    intro:
      "A vanilla cupcake has nowhere to hide. We use real vanilla, sour cream for moisture, and a two-bowl method so the crumb stays fine. The buttercream is simple on purpose — vanilla, butter, a pinch of salt.",
    whyItWorks:
      "Room-temperature dairy emulsifies instead of breaking. Sour cream keeps the cupcakes tender the next day. Filling the liners two-thirds full gives you a gentle dome that is easy to frost, not a muffin top.",
    keyIngredients: [
      {
        name: "Vanilla",
        note: "A scraped bean is lovely. 1½ teaspoons of good extract is what we use most days.",
      },
      {
        name: "Sour cream",
        note: "Full-fat. Greek yogurt (2 to 5 percent) is the swap.",
      },
    ],
    tips: [
      "Weigh the flour. Extra flour is the usual reason cupcakes bake up dry.",
      "Cool completely before frosting or the buttercream will slide.",
      "A closed-star tip makes an easy swirl. A spooned dollop is just as welcome.",
    ],
    faqs: [
      {
        question: "Can I bake this as a layer cake?",
        answer:
          "Yes. Divide between two 8-inch pans and bake 22 to 26 minutes. The buttercream quantity is enough to fill and frost lightly.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "Vanilla cupcakes with swirled frosting",
    publishedAt: "2026-04-18",
    updatedAt: "2026-08-16",
    prepMinutes: 25,
    cookMinutes: 18,
    servings: 12,
    servingsUnit: "cupcakes",
    course: "Dessert",
    method: "Oven",
    cuisine: "American",
    categories: ["cakes", "desserts", "oven"],
    tags: ["cupcakes", "vanilla", "frosting", "baking"],
    featured: true,
    ingredients: [
      {
        name: "Cupcakes",
        items: [
          { item: "all-purpose flour", amount: "1½ cups", grams: 180 },
          { item: "baking powder", amount: "1½ teaspoons" },
          { item: "baking soda", amount: "¼ teaspoon" },
          { item: "kosher salt", amount: "½ teaspoon" },
          { item: "granulated sugar", amount: "¾ cup", grams: 150 },
          { item: "unsalted butter", amount: "½ cup", grams: 113, notes: "softened" },
          { item: "large eggs", amount: "2", notes: "room temperature" },
          { item: "sour cream", amount: "½ cup", grams: 120 },
          { item: "whole milk", amount: "¼ cup", grams: 60 },
          { item: "vanilla extract", amount: "1½ teaspoons" },
        ],
      },
      {
        name: "Buttercream",
        items: [
          { item: "unsalted butter", amount: "1 cup", grams: 226, notes: "softened" },
          { item: "powdered sugar", amount: "3 cups", grams: 360 },
          { item: "vanilla extract", amount: "1½ teaspoons" },
          { item: "kosher salt", amount: "1 pinch" },
          { item: "whole milk or cream", amount: "1 to 2 tablespoons" },
        ],
      },
    ],
    instructions: [
      {
        name: "Cupcakes",
        steps: [
          "Heat the oven to 350°F (175°C). Line a 12-cup muffin tin.",
          "Whisk flour, baking powder, baking soda, and salt.",
          "Beat butter and sugar until pale, 2 minutes. Beat in eggs one at a time, then sour cream, milk, and vanilla. The mixture may look slightly curdled.",
          "Fold in the dry ingredients just until combined. Divide among liners.",
          "Bake 16 to 18 minutes, until the centers spring back. Cool completely.",
        ],
      },
      {
        name: "Buttercream",
        steps: [
          "Beat the butter until creamy. Add powdered sugar in two additions, then vanilla, salt, and enough milk to make a soft, pipeable frosting.",
          "Swirl onto the cooled cupcakes.",
        ],
      },
    ],
    notes: ["Unfrosted cupcakes freeze well for a month. Thaw, then frost."],
    nutrition: { calories: 412, carbs: 52, protein: 3, fat: 21, sugar: 40 },
  },
  {
    slug: "roasted-market-vegetables",
    title: "Roasted Market Vegetables",
    excerpt: "High-heat vegetables with olive oil, cumin, and a squeeze of lemon.",
    intro:
      "A sheet pan of mixed vegetables is the studio side we never get tired of. The trick is space, heat, and salting twice — once before they roast, once when they come out with lemon.",
    whyItWorks:
      "Crowding steams. Two pans or a single generous sheet gives you caramelized edges. Similar-density vegetables can share a pan; add quicker-cooking pieces later if you mix zucchini with carrots.",
    keyIngredients: [
      {
        name: "A mix of vegetables",
        note: "Carrots, cauliflower, red onion, and sweet potato are a reliable winter mix. Summer: zucchini, peppers, and tomatoes in the last 10 minutes.",
      },
      {
        name: "Lemon",
        note: "Acid at the end wakes up roasted sweetness.",
      },
    ],
    tips: [
      "Cut pieces the same size. A huge carrot next to a thin wedge of onion will never finish together.",
      "Preheat the sheet pan. Vegetables that hit hot metal start browning immediately.",
      "Finish with herbs after roasting so they stay green.",
    ],
    faqs: [
      {
        question: "Can I roast these ahead?",
        answer:
          "Yes. Reheat at 400°F for 8 to 10 minutes. Add the lemon and herbs after they come back out.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "A colorful bowl of roasted vegetables",
    publishedAt: "2026-02-16",
    updatedAt: "2026-06-19",
    prepMinutes: 15,
    cookMinutes: 35,
    servings: 4,
    servingsUnit: "servings",
    course: "Side",
    method: "Oven",
    holiday: "Summer",
    cuisine: "Mediterranean",
    categories: ["side-dishes", "oven", "summer"],
    tags: ["vegetables", "side", "weeknight"],
    seasonal: true,
    ingredients: [
      {
        items: [
          { item: "mixed vegetables", amount: "2 pounds", grams: 900, notes: "cut in 1-inch pieces" },
          { item: "olive oil", amount: "3 tablespoons" },
          { item: "kosher salt", amount: "1 teaspoon" },
          { item: "black pepper", amount: "½ teaspoon" },
          { item: "ground cumin", amount: "1 teaspoon" },
          { item: "lemon", amount: "1", notes: "zested and juiced" },
          { item: "parsley or cilantro", amount: "¼ cup", notes: "chopped" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Heat the oven to 425°F (220°C) with a sheet pan inside.",
          "Toss the vegetables with oil, salt, pepper, and cumin.",
          "Spread on the hot pan in a single layer. Roast 30 to 35 minutes, turning once, until browned at the edges and tender.",
          "Toss with lemon zest, juice, and herbs. Taste for salt and serve.",
        ],
      },
    ],
    notes: ["A spoon of salsa verde on top is not traditional. It is very good."],
    nutrition: { calories: 164, carbs: 18, protein: 3, fat: 10, fiber: 5 },
  },
  {
    slug: "iced-horchata-coffee",
    title: "Iced Horchata Coffee",
    excerpt: "Cold coffee shaken with cinnamon-rice milk — porch weather in a glass.",
    intro:
      "Horchata is the rice-and-cinnamon drink we grew up reaching for. Shaken over ice with strong coffee it becomes the studio afternoon: sweet, cold, and lightly spiced.",
    whyItWorks:
      "Blending soaked rice extracts starch that body-builds the drink. A short steep keeps it from turning pasty. Coffee should be strong and fully cooled or the ice will drown it.",
    keyIngredients: [
      {
        name: "Long-grain white rice",
        note: "Plain rice, not jasmine if you can help it — jasmine can read floral against the coffee.",
      },
      {
        name: "Cinnamon",
        note: "A stick in the soak, ground cinnamon to finish the glass.",
      },
    ],
    tips: [
      "Make the horchata the night before. It keeps 3 days and tastes calmer on day two.",
      "Sweeten the rice milk, not the coffee, so every glass is consistent.",
      "A splash of vanilla is optional and very good.",
    ],
    faqs: [
      {
        question: "Can I use store-bought horchata?",
        answer:
          "Yes. Shake it well, then mix equal parts with cold coffee over ice. Homemade is less sweet and more cinnamon-forward.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "Iced coffee in a tall glass",
    publishedAt: "2026-05-26",
    updatedAt: "2026-08-06",
    prepMinutes: 15,
    cookMinutes: 0,
    servings: 4,
    servingsUnit: "glasses",
    course: "Drink",
    method: "No bake",
    holiday: "Summer",
    cuisine: "Mexican",
    categories: ["drinks", "breakfast", "no-bake", "summer"],
    tags: ["coffee", "horchata", "drinks", "summer"],
    seasonal: true,
    ingredients: [
      {
        items: [
          { item: "long-grain white rice", amount: "½ cup", grams: 95 },
          { item: "cinnamon stick", amount: "1" },
          { item: "cold water", amount: "3 cups" },
          { item: "whole milk or oat milk", amount: "1 cup" },
          { item: "sugar", amount: "3 tablespoons", notes: "or to taste" },
          { item: "vanilla extract", amount: "½ teaspoon" },
          { item: "strong cold coffee or espresso", amount: "2 cups" },
          { item: "ice", amount: "for serving" },
          { item: "ground cinnamon", amount: "for dusting" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Soak the rice and cinnamon stick in 2 cups of the water for at least 4 hours or overnight in the fridge.",
          "Blend the rice, cinnamon stick, and soaking water until as smooth as you can get it, 1 full minute.",
          "Strain through a fine-mesh sieve lined with cheesecloth. Stir in the remaining 1 cup water, milk, sugar, and vanilla.",
          "Fill glasses with ice. Pour in equal parts horchata and cold coffee. Dust with cinnamon.",
        ],
      },
    ],
    notes: ["Leftover horchata is excellent without coffee, over more ice."],
    nutrition: { calories: 142, carbs: 24, protein: 3, fat: 3, sugar: 12 },
  },
  {
    slug: "salsa-verde",
    title: "Salsa Verde",
    excerpt: "Tomatillos, chile, and cilantro blended into a bright table salsa.",
    intro:
      "We keep a jar of this in the fridge most weeks. It goes on eggs, roasted chicken, vegetables, and anything that needs a sharp green note. Broiling the tomatillos sweetens them just enough.",
    whyItWorks:
      "Raw tomatillos are very tart. A few minutes under the broiler gives you char and a little jamminess without turning the salsa dull. Cilantro stems have as much flavor as the leaves — use both.",
    keyIngredients: [
      {
        name: "Tomatillos",
        note: "Husk them and rinse off the sticky film. They should feel firm and bright green.",
      },
      {
        name: "Serrano or jalapeño",
        note: "Serrano is hotter. Seed the chile if you want the herbal flavor without the burn.",
      },
    ],
    tips: [
      "Salt at the end. The salsa tastes louder once it cools.",
      "If it is too sharp, a small piece of avocado blended in rounds it without making it creamy.",
      "It thickens in the fridge. Loosen with a spoon of water if you want it pourable.",
    ],
    faqs: [
      {
        question: "How long does it keep?",
        answer: "Up to 5 days in a sealed jar in the refrigerator. The color stays brightest for the first two.",
      },
      {
        question: "Can I skip the broiler?",
        answer:
          "You can simmer the tomatillos in water until olive-green, about 8 minutes. The salsa will be softer and less smoky.",
      },
    ],
    image:
      "https://images.unsplash.com/photo-1617093727343-374698b1b08d?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "A bowl of green salsa with chips",
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER",
    youtube: SALSA_VERDE_YOUTUBE,
    publishedAt: "2026-03-03",
    updatedAt: "2026-07-14",
    prepMinutes: 10,
    cookMinutes: 8,
    servings: 8,
    servingsUnit: "servings",
    course: "Condiment",
    method: "No bake",
    cuisine: "Mexican",
    categories: ["toppings", "no-bake", "summer"],
    tags: ["salsa", "tomatillo", "condiment", "quick"],
    seasonal: true,
    ingredients: [
      {
        items: [
          { item: "tomatillos", amount: "1 pound", grams: 450, notes: "husked and rinsed" },
          { item: "serrano or jalapeño", amount: "1", notes: "stemmed" },
          { item: "garlic clove", amount: "1" },
          { item: "white onion", amount: "¼", notes: "roughly chopped" },
          { item: "cilantro", amount: "1 packed cup", notes: "leaves and tender stems" },
          { item: "kosher salt", amount: "¾ teaspoon" },
          { item: "lime juice", amount: "1 tablespoon" },
        ],
      },
    ],
    instructions: [
      {
        steps: [
          "Heat the broiler. Set tomatillos and the chile on a small sheet pan. Broil 5 to 8 minutes, turning once, until blistered and collapsing.",
          "Cool 5 minutes. Blend with garlic, onion, cilantro, salt, and lime until mostly smooth with a little texture.",
          "Taste. Add salt or lime. Rest 15 minutes before serving so the flavors settle.",
        ],
      },
    ],
    notes: ["Makes about 2 cups."],
    nutrition: { calories: 22, carbs: 4, protein: 1, fat: 0 },
  },
];
