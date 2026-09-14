import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { site } from "@/data/site";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import { getDb } from "@/lib/db";
import { describeDatabaseTarget } from "@/lib/ingredient-index/cli-guard";
import { rebuildRecipeIngredientIndex } from "@/lib/ingredient-index";
import { seedIngredientIdentity as seedDb } from "@/lib/ingredient-index/seed-db";
import {
  INGREDIENT_INDEXABLE_MIN_RECIPES,
  classifyIngredientPublicSeoState,
  formatIngredientPublicSeoStatus,
  formatIngredientSeoReadinessReport,
  getPublicIngredientLanding,
  ingredientItemListJsonLd,
  ingredientMetaDescription,
  ingredientPageTitleSegment,
  ingredientPublicPath,
  isIngredientPageIndexable,
  isIngredientSeoEnabled,
  listIndexableIngredientSlugs,
  listReachableIngredientSlugs,
  loadIndexableIngredientLinkMap,
  loadRecipeIngredientSeoLinks,
  reportIngredientSeoReadiness,
} from "@/lib/ingredient-seo";
import { classifySearchConsolePath } from "@/lib/search-console/paths";
import { classifyInternalPublicPath } from "@/lib/site-health";
import { buildSitemapEntries, sitemapPathnamesFromEntries } from "@/lib/sitemap-entries";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const PREFIX = `ing8_${Date.now().toString(36)}_`;

describe("ING-8 — indexability helpers", () => {
  it("threshold constant and indexability matrix", () => {
    assert.equal(INGREDIENT_INDEXABLE_MIN_RECIPES, 3);
    assert.equal(isIngredientPageIndexable(0), false);
    assert.equal(isIngredientPageIndexable(1), false);
    assert.equal(isIngredientPageIndexable(2), false);
    assert.equal(isIngredientPageIndexable(3), true);
    assert.equal(isIngredientPageIndexable(4), true);
    assert.equal(classifyIngredientPublicSeoState(0), "NOT_PUBLIC");
    assert.equal(classifyIngredientPublicSeoState(1), "REACHABLE_NOINDEX");
    assert.equal(classifyIngredientPublicSeoState(2), "REACHABLE_NOINDEX");
    assert.equal(classifyIngredientPublicSeoState(3), "INDEXABLE");
  });

  it("title, description, path, and status wording", () => {
    assert.equal(ingredientPublicPath("egg"), "/ingredient/egg");
    assert.equal(ingredientPageTitleSegment("Egg"), "Egg Recipes");
    assert.equal(ingredientPageTitleSegment("All-purpose flour"), "All-purpose flour Recipes");
    assert.equal(
      ingredientMetaDescription("Egg"),
      `Browse ${site.name} recipes featuring Egg.`,
    );
    assert.equal(site.url, "https://www.mesakitchenstudio.com");
    assert.match(
      formatIngredientPublicSeoStatus({ seoEnabled: false, publishedRecipeCount: 5 }),
      /SEO disabled/,
    );
    assert.equal(
      formatIngredientPublicSeoStatus({ seoEnabled: true, publishedRecipeCount: 0 }),
      "Not public",
    );
    assert.equal(
      formatIngredientPublicSeoStatus({ seoEnabled: true, publishedRecipeCount: 2 }),
      "Reachable · noindex",
    );
    assert.equal(
      formatIngredientPublicSeoStatus({ seoEnabled: true, publishedRecipeCount: 3 }),
      "Indexable",
    );
  });

  it("gate defaults from env without NEXT_PUBLIC", () => {
    assert.equal(isIngredientSeoEnabled(), process.env.INGREDIENT_SEO_ENABLED === "true");
    assert.doesNotMatch(read("ingredient-seo.ts"), /NEXT_PUBLIC_INGREDIENT_SEO/);
  });
});

describe("ING-8 — OFF-state metadata and page gate (runtime)", () => {
  it("generateMetadata returns soft not-found when SEO OFF (no throw)", async () => {
    const prev = process.env.INGREDIENT_SEO_ENABLED;
    process.env.INGREDIENT_SEO_ENABLED = "false";
    try {
      const mod = await import("../app/ingredient/[slug]/page");
      const meta = await mod.generateMetadata({
        params: Promise.resolve({ slug: "example" }),
      });
      assert.equal(meta.title, "Not found");
      assert.deepEqual(meta.robots, { index: false, follow: false });
    } finally {
      if (prev === undefined) delete process.env.INGREDIENT_SEO_ENABLED;
      else process.env.INGREDIENT_SEO_ENABLED = prev;
    }
  });

  it("page default export calls notFound when SEO OFF", async () => {
    const prev = process.env.INGREDIENT_SEO_ENABLED;
    process.env.INGREDIENT_SEO_ENABLED = "false";
    try {
      const mod = await import("../app/ingredient/[slug]/page");
      await assert.rejects(
        () => mod.default({ params: Promise.resolve({ slug: "example" }) }),
        (err: unknown) => {
          const digest = (err as { digest?: string } | null)?.digest;
          // next/navigation notFound() uses NEXT_HTTP_ERROR_FALLBACK;404 or similar
          return (
            digest === "NEXT_HTTP_ERROR_FALLBACK;404" ||
            digest === "NEXT_NOT_FOUND" ||
            (err instanceof Error && /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String(err)))
          );
        },
      );
    } finally {
      if (prev === undefined) delete process.env.INGREDIENT_SEO_ENABLED;
      else process.env.INGREDIENT_SEO_ENABLED = prev;
    }
  });
});

describe("ING-8 — route and wiring", () => {
  it("public route gates, metadata, structured data, and grid", () => {
    const page = read("../app/ingredient/[slug]/page.tsx");
    assert.match(page, /isIngredientSeoEnabled/);
    assert.match(page, /notFound\(\)/);
    // force-dynamic: OFF empty generateStaticParams must not on-demand SSG into
    // DYNAMIC_SERVER_USAGE; dynamicParams true: Admin-created slugs stay reachable.
    assert.match(page, /dynamic = "force-dynamic"/);
    assert.match(page, /dynamicParams = true/);
    assert.match(page, /listReachableIngredientSlugs/);
    assert.doesNotMatch(page, /listIndexableIngredientSlugs/);
    assert.match(page, /ingredientPageTitleSegment/);
    assert.match(page, /ingredientMetaDescription/);
    assert.match(page, /alternates: \{ canonical: path \}/);
    assert.match(page, /robots: \{ index: false, follow: true \}/);
    assert.match(page, /buildBreadcrumbJsonLd/);
    assert.match(page, /ingredientItemListJsonLd/);
    assert.match(page, /RecipeGridCard/);
    assert.doesNotMatch(page, /recipeJsonLd|CollectionPage|Nutrition/);
    assert.doesNotMatch(page, /Also known as/i);
  });

  it("generateStaticParams uses reachable (≥1 published), not indexable (≥3) only", () => {
    const page = read("../app/ingredient/[slug]/page.tsx");
    assert.match(page, /listReachableIngredientSlugs/);
    assert.doesNotMatch(page, /listIndexableIngredientSlugs/);
    const docs = read("admin-documentation/topics/ingredients.ts");
    assert.match(docs, /1–2 Published Recipes are reachable but noindex/);
    assert.match(docs, /zero Published Recipes are not public/);
  });

  it("OFF-state fails closed before Ingredient data / SEO work", () => {
    const page = read("../app/ingredient/[slug]/page.tsx");
    const gateMeta = page.indexOf("generateMetadata");
    const metaOff = page.indexOf("if (!isIngredientSeoEnabled())", gateMeta);
    const metaDb = page.indexOf("getPublicIngredientLanding", metaOff);
    assert.ok(metaOff > gateMeta && metaDb > metaOff);

    const pageFn = page.indexOf("export default async function IngredientSeoPage");
    const pageOff = page.indexOf("if (!isIngredientSeoEnabled()) notFound()", pageFn);
    const pageDb = page.indexOf("getPublicIngredientLanding", pageOff);
    assert.ok(pageOff > pageFn && pageDb > pageOff);
    // Soft metadata when OFF (same pattern as shopping-list / CWYW) — must not throw.
    assert.match(page, /title: "Not found", robots: \{ index: false, follow: false \}/);
  });

  it("Shopping List gating stays independent of Ingredient SEO route", () => {
    const shopping = read("../app/shopping-list/page.tsx");
    assert.match(shopping, /isShoppingListEnabled/);
    assert.match(shopping, /notFound\(\)/);
    assert.doesNotMatch(shopping, /isIngredientSeoEnabled/);
    assert.doesNotMatch(read("../app/ingredient/[slug]/page.tsx"), /isShoppingListEnabled/);
  });

  it("does not create /ingredients index or alias redirects", () => {
    assert.throws(() => read("../app/ingredients/page.tsx"));
    const page = read("../app/ingredient/[slug]/page.tsx");
    assert.doesNotMatch(page, /redirect|alias/i);
    assert.doesNotMatch(read("../components/SiteHeader.tsx"), /\/ingredient/);
    assert.doesNotMatch(read("../components/SiteFooter.tsx"), /\/ingredient/);
  });

  it("sitemap includes ingredients only via gate + indexable loader", () => {
    const sitemap = read("../app/sitemap.ts");
    assert.match(sitemap, /isIngredientSeoEnabled/);
    assert.match(sitemap, /listIndexableIngredientSlugs/);
    assert.match(sitemap, /ingredients/);

    const entries = buildSitemapEntries({
      siteUrl: site.url,
      recipes: [],
      categories: [],
      series: [],
      ingredients: [{ slug: "egg" }],
    });
    const paths = sitemapPathnamesFromEntries(entries, site.url);
    assert.ok(paths.includes("/ingredient/egg"));
    assert.equal(paths.includes("/ingredients"), false);

    const without = buildSitemapEntries({
      siteUrl: site.url,
      recipes: [],
      categories: [],
      series: [],
    });
    assert.equal(
      sitemapPathnamesFromEntries(without, site.url).some((p) => p.startsWith("/ingredient/")),
      false,
    );
  });

  it("Recipe detail links are server-batched; Preview / Cook / Print stay plain", () => {
    assert.match(read("recipe-detail-presentation.ts"), /loadRecipeIngredientSeoLinks/);
    assert.match(read("../components/recipe/RecipeDetailView.tsx"), /preview \? \{\} : ingredientSeoLinks/);
    assert.match(read("../components/RecipeCard.tsx"), /ingredientSeoLinks/);
    assert.doesNotMatch(
      read("../components/cooking/CookingIngredientsPanel.tsx"),
      /ingredientSeo|\/ingredient\//,
    );
    assert.doesNotMatch(read("../components/RecipePrintSheet.tsx"), /\/ingredient|ingredientSeo/);
    assert.doesNotMatch(read("../components/CookWithWhatYouHave.tsx"), /\/ingredient\//);
    assert.doesNotMatch(read("../components/DiscoveryIngredientFilters.tsx"), /href=.*\/ingredient/);
  });

  it("Admin shows published count, SEO status, and gated View link", () => {
    const manager = read("../components/admin/IngredientsManager.tsx");
    assert.match(manager, /publishedRecipeCount/);
    assert.match(manager, /formatIngredientPublicSeoStatus/);
    assert.match(manager, /View public page/);
    assert.match(manager, /SEO disabled/);
    assert.match(read("../app/admin/(app)/ingredients/page.tsx"), /isIngredientSeoEnabled/);
    assert.match(read("ingredient-admin.ts"), /loadPublishedRecipeCountsByIngredientIds/);
  });

  it("docs and CLI readiness are wired", () => {
    const docs = read("admin-documentation/topics/ingredients.ts");
    assert.match(docs, /Public Ingredient pages/);
    assert.match(docs, /INGREDIENT_SEO_ENABLED/);
    assert.match(docs, /3 distinct Published/);
    assert.match(docs, /Aliases never create separate public/);
    assert.match(read("../../package.json"), /ingredient:seo-readiness/);
    assert.match(read("../../scripts/report-ingredient-seo-readiness.ts"), /describeDatabaseTarget/);
    assert.match(describeDatabaseTarget(), /Database target/);
  });
});

describe("ING-8 — structured data", () => {
  it("BreadcrumbList + ItemList shapes; no Recipe aggregate schema", () => {
    const crumbs = buildBreadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: "Recipes", url: "/recipes" },
      { name: "Egg Recipes", url: "/ingredient/egg" },
    ]);
    assert.equal(crumbs["@type"], "BreadcrumbList");
    assert.equal(crumbs.itemListElement.length, 3);
    assert.equal(crumbs.itemListElement[0].item, `${site.url}/`);
    assert.equal(crumbs.itemListElement[1].item, `${site.url}/recipes`);
    assert.equal(crumbs.itemListElement[2].item, `${site.url}/ingredient/egg`);

    const list = ingredientItemListJsonLd({
      name: "Egg",
      slug: "egg",
      description: ingredientMetaDescription("Egg"),
      recipes: [
        { title: "Cake", slug: "olive-oil-cake" },
        { title: "Cookie", slug: "chocolate-chip" },
      ],
    });
    assert.equal(list["@type"], "ItemList");
    assert.equal(list.numberOfItems, 2);
    assert.equal(list.itemListElement[0].position, 1);
    assert.equal(list.itemListElement[1].position, 2);
    assert.equal(list.itemListElement[0].url, `${site.url}/recipes/olive-oil-cake`);
    assert.equal(list.url, `${site.url}/ingredient/egg`);
    assert.doesNotMatch(JSON.stringify(list), /"@type":"Recipe"/);
  });
});

describe("ING-8 — Search Console and guest path classification", () => {
  it("classifies /ingredient/[slug] as ingredient", () => {
    assert.equal(classifySearchConsolePath("/ingredient/egg"), "ingredient");
    assert.equal(classifySearchConsolePath("/ingredients"), "other");
    assert.equal(classifySearchConsolePath("/recipes/x"), "recipe");
    assert.equal(classifySearchConsolePath("/category/bread"), "category");
    assert.equal(classifySearchConsolePath("/series/y"), "collection");
  });

  it("classifies internal public paths", () => {
    assert.equal(classifyInternalPublicPath("/ingredient/egg").kind, "ingredient");
    assert.equal(classifyInternalPublicPath("/ingredient/egg").slug, "egg");
    assert.equal(classifyInternalPublicPath("/category/bread").kind, "category");
  });
});

describe("ING-8 — loader, membership, links, readiness (DB)", () => {
  let available = false;
  let typeId = "";
  const recipeIds: string[] = [];
  let eggId = "";
  let potatoId = "";

  before(async () => {
    const db = getDb();
    try {
      await db.ingredient.count();
      available = true;
    } catch {
      available = false;
      return;
    }
    const type = await db.recipeType.create({
      data: { name: `${PREFIX}type`, slug: `${PREFIX}type` },
    });
    typeId = type.id;
    await seedDb(db);
    eggId = (await db.ingredient.findUnique({ where: { nameNorm: "egg" } }))?.id || "";
    potatoId = (await db.ingredient.findUnique({ where: { nameNorm: "potato" } }))?.id || "";
  });

  after(async () => {
    if (!available) return;
    const db = getDb();
    for (const id of recipeIds) {
      await db.recipe.delete({ where: { id } }).catch(() => undefined);
    }
    if (typeId) {
      await db.recipeType.delete({ where: { id: typeId } }).catch(() => undefined);
    }
  });

  async function createRecipe(input: {
    slug: string;
    status: "published" | "draft";
    items: Array<{ item: string } | { item: string; amount?: string }>;
    duplicateEgg?: boolean;
    scheduledPublishAt?: Date | null;
  }) {
    const db = getDb();
    const items = [...input.items];
    if (input.duplicateEgg) {
      items.push({ item: "Egg" }, { item: "large eggs" });
    }
    const values = JSON.stringify({
      ingredients: [
        {
          name: "Batter",
          items: items.map((row) => ({ amount: "1", ...row })),
        },
        ...(input.duplicateEgg
          ? [{ name: "Glaze", items: [{ amount: "1", item: "Egg" }] }]
          : []),
      ],
    });
    const recipe = await db.recipe.create({
      data: {
        title: `${PREFIX}${input.slug}`,
        slug: `${PREFIX}${input.slug}`,
        excerpt: "",
        typeId,
        status: input.status,
        publishedAt: input.status === "published" ? new Date() : null,
        scheduledPublishAt: input.scheduledPublishAt ?? null,
        values,
      },
    });
    recipeIds.push(recipe.id);
    await rebuildRecipeIngredientIndex(db, { recipeId: recipe.id, values });
    return recipe;
  }

  it("unknown slug and zero published → null landing", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    assert.equal(await getPublicIngredientLanding(db, "no-such-ingredient-xyz"), null);
    const unused = await db.ingredient.create({
      data: {
        name: `${PREFIX} Unused`,
        nameNorm: `${PREFIX}unused`,
        slug: `${PREFIX}unused`,
      },
    });
    try {
      assert.equal(await getPublicIngredientLanding(db, unused.slug), null);
    } finally {
      await db.ingredient.delete({ where: { id: unused.id } }).catch(() => undefined);
    }
  });

  it("membership: published included; draft/scheduled/unresolved excluded; distinct cards", async (t) => {
    if (!available || !eggId) return t.skip("Ingredient tables missing");
    const db = getDb();
    const pub = await createRecipe({
      slug: "egg-pub",
      status: "published",
      items: [{ item: "large eggs" }],
      duplicateEgg: true,
    });
    await createRecipe({
      slug: "egg-draft",
      status: "draft",
      items: [{ item: "Egg" }],
    });
    await createRecipe({
      slug: "egg-sched",
      status: "draft",
      items: [{ item: "Egg" }],
      scheduledPublishAt: new Date("2035-01-01T00:00:00.000Z"),
    });
    await createRecipe({
      slug: "unresolved-only",
      status: "published",
      items: [{ item: `${PREFIX} special spice mix` }],
    });

    const landing = await getPublicIngredientLanding(db, "egg");
    assert.ok(landing);
    assert.ok(landing!.recipes.some((r) => r.slug === pub.slug));
    assert.equal(landing!.recipes.filter((r) => r.slug === pub.slug).length, 1);
    assert.equal(landing!.recipes.some((r) => r.slug.includes("egg-draft")), false);
    assert.equal(landing!.recipes.some((r) => r.slug.includes("egg-sched")), false);

    const eggRows = await db.recipeIngredient.findMany({
      where: { recipeId: pub.id, ingredientId: eggId },
    });
    assert.ok(eggRows.length >= 2);
    assert.ok(eggRows.every((row) => row.ingredientId === eggId));
  });

  it("thin Ingredient (1 published) is reachable noindex; generateStaticParams list includes it", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const slug = `${PREFIX}thin-solo`;
    const ing = await db.ingredient.create({
      data: {
        name: `${PREFIX} Thin Solo`,
        nameNorm: `${PREFIX}thin solo`,
        slug,
      },
    });
    try {
      const recipe = await createRecipe({
        slug: "thin-solo-recipe",
        status: "published",
        items: [{ item: `${PREFIX} Thin Solo` }],
      });
      // Ensure membership even if phrase match missed the new name
      const rows = await db.recipeIngredient.findMany({ where: { recipeId: recipe.id } });
      for (const row of rows) {
        await db.recipeIngredient.update({
          where: { id: row.id },
          data: { ingredientId: ing.id, matchedVia: "EXACT" },
        });
      }
      if (!rows.length) {
        await db.recipeIngredient.create({
          data: {
            recipeId: recipe.id,
            ingredientId: ing.id,
            groupIndex: 0,
            itemIndex: 0,
            authoredItem: `${PREFIX} Thin Solo`,
            authoredItemNorm: `${PREFIX}thin solo`,
            matchedVia: "EXACT",
          },
        });
      }

      const landing = await getPublicIngredientLanding(db, slug);
      assert.ok(landing);
      assert.equal(landing!.publishedRecipeCount, 1);
      assert.equal(landing!.indexable, false);
      assert.equal(classifyIngredientPublicSeoState(1), "REACHABLE_NOINDEX");

      const reachable = await listReachableIngredientSlugs(db);
      assert.ok(reachable.includes(slug));
      const indexable = await listIndexableIngredientSlugs(db);
      assert.equal(indexable.includes(slug), false);

      const prev = process.env.INGREDIENT_SEO_ENABLED;
      process.env.INGREDIENT_SEO_ENABLED = "true";
      try {
        const mod = await import("../app/ingredient/[slug]/page");
        const meta = await mod.generateMetadata({
          params: Promise.resolve({ slug }),
        });
        assert.deepEqual(meta.robots, { index: false, follow: true });
        assert.match(String(meta.title), /Thin Solo Recipes/);
      } finally {
        if (prev === undefined) delete process.env.INGREDIENT_SEO_ENABLED;
        else process.env.INGREDIENT_SEO_ENABLED = prev;
      }
    } finally {
      await db.ingredient.delete({ where: { id: ing.id } }).catch(() => undefined);
    }
  });

  it("indexable map and recipe links respect threshold and gate", async (t) => {
    if (!available || !eggId) return t.skip("Ingredient tables missing");
    const db = getDb();
    const prev = process.env.INGREDIENT_SEO_ENABLED;
    const made: string[] = [];
    try {
      // Ensure at least 3 published egg recipes for this suite run
      for (let i = 0; i < 3; i += 1) {
        const recipe = await createRecipe({
          slug: `egg-link-${i}`,
          status: "published",
          items: [{ item: "Egg" }],
        });
        made.push(recipe.id);
      }

      process.env.INGREDIENT_SEO_ENABLED = "false";
      const offLinks = await loadRecipeIngredientSeoLinks(db, made[0]);
      assert.deepEqual(offLinks, {});

      process.env.INGREDIENT_SEO_ENABLED = "true";
      const map = await loadIndexableIngredientLinkMap(db, [eggId]);
      assert.ok(map.has(eggId));
      assert.equal(map.get(eggId)?.slug, "egg");

      const links = await loadRecipeIngredientSeoLinks(db, made[0]);
      assert.ok(Object.values(links).includes("egg"));

      if (potatoId) {
        const potatoOnly = await createRecipe({
          slug: "potato-thin",
          status: "published",
          items: [{ item: "Potato" }],
        });
        const potatoMap = await loadIndexableIngredientLinkMap(db, [potatoId]);
        // May still be indexable from seed corpus recipes; only assert thin when count < 3
        const potatoLanding = await getPublicIngredientLanding(db, "potato");
        if (potatoLanding && potatoLanding.publishedRecipeCount < 3) {
          assert.equal(potatoMap.has(potatoId), false);
          const potatoLinks = await loadRecipeIngredientSeoLinks(db, potatoOnly.id);
          assert.equal(Object.keys(potatoLinks).length, 0);
        }
      }
    } finally {
      if (prev === undefined) delete process.env.INGREDIENT_SEO_ENABLED;
      else process.env.INGREDIENT_SEO_ENABLED = prev;
    }
  });

  it("listIndexableIngredientSlugs and readiness report", async (t) => {
    if (!available) return t.skip("Ingredient tables missing");
    const db = getDb();
    const slugs = await listIndexableIngredientSlugs(db);
    for (const slug of slugs) {
      const landing = await getPublicIngredientLanding(db, slug);
      assert.ok(landing);
      assert.equal(landing!.indexable, true);
      assert.ok(landing!.publishedRecipeCount >= INGREDIENT_INDEXABLE_MIN_RECIPES);
    }

    const rows = await reportIngredientSeoReadiness(db);
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1]!;
      const cur = rows[i]!;
      assert.ok(
        prev.publishedRecipeCount > cur.publishedRecipeCount ||
          (prev.publishedRecipeCount === cur.publishedRecipeCount &&
            prev.name.localeCompare(cur.name) <= 0),
      );
    }
    const text = formatIngredientSeoReadinessReport(rows);
    assert.match(text, /PUBLIC_STATE/);
    assert.match(text, /Indexable threshold/);
    const again = formatIngredientSeoReadinessReport(await reportIngredientSeoReadiness(db));
    assert.equal(text, again);
  });

  it("schema remains without Ingredient SEO fields", () => {
    const schema = read("../../prisma/schema.prisma");
    const block = schema.slice(schema.indexOf("model Ingredient {"), schema.indexOf("model IngredientAlias {"));
    assert.match(block, /nameNorm/);
    assert.match(block, /slug/);
    assert.doesNotMatch(block, /seoTitle|seoDescription|hero|description/);
  });
});
