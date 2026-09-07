import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeRedirectPath,
  recipePublicPath,
  resolveRedirectChain,
  upsertRecipeSlugChangeRedirect,
} from "./redirects.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

describe("redirect helpers", () => {
  it("normalizes public pathnames", () => {
    assert.equal(normalizeRedirectPath("/recipes/baguettes/"), "/recipes/baguettes");
    assert.equal(
      normalizeRedirectPath("https://www.mesakitchenstudio.com/recipes/baguettes?x=1"),
      "/recipes/baguettes",
    );
    assert.equal(normalizeRedirectPath(""), null);
    assert.equal(normalizeRedirectPath("/recipes/bad path"), null);
  });

  it("builds recipe public paths", () => {
    assert.equal(recipePublicPath("classic-baguettes"), "/recipes/classic-baguettes");
  });

  it("resolves a single hop redirect", () => {
    const map = new Map([
      ["/recipes/old", { toPath: "/recipes/new", isActive: true }],
    ]);
    assert.equal(
      resolveRedirectChain("/recipes/old", (p) => map.get(p)),
      "/recipes/new",
    );
  });

  it("follows a short chain and stops at the final destination", () => {
    const map = new Map([
      ["/recipes/a", { toPath: "/recipes/b", isActive: true }],
      ["/recipes/b", { toPath: "/recipes/c", isActive: true }],
    ]);
    assert.equal(
      resolveRedirectChain("/recipes/a", (p) => map.get(p)),
      "/recipes/c",
    );
  });

  it("flattens incoming redirects when a published slug changes again", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    const suffix = `flat-${Date.now()}`;
    const a = `a-${suffix}`;
    const b = `b-${suffix}`;
    const c = `c-${suffix}`;
    try {
      const type = await db.recipeType.create({
        data: { slug: `t-${suffix}`, name: `T ${suffix}` },
      });
      await db.recipe.create({
        data: {
          slug: b,
          title: "Flatten",
          typeId: type.id,
          status: "published",
          publishedAt: new Date(),
          values: "{}",
        },
      });
      const first = await upsertRecipeSlugChangeRedirect({
        previousSlug: a,
        nextSlug: b,
        wasPublished: true,
      });
      assert.ok(first && first.ok);
      await db.recipe.update({ where: { slug: b }, data: { slug: c } });
      const second = await upsertRecipeSlugChangeRedirect({
        previousSlug: b,
        nextSlug: c,
        wasPublished: true,
      });
      assert.ok(second && second.ok);
      const fromA = await db.redirect.findUnique({
        where: { fromPath: recipePublicPath(a) },
      });
      assert.equal(fromA?.toPath, recipePublicPath(c));
      assert.equal(fromA?.isActive, true);
      await db.recipe.deleteMany({ where: { slug: c } });
      await db.recipeType.delete({ where: { id: type.id } });
      await db.redirect.deleteMany({
        where: {
          OR: [
            { fromPath: { contains: suffix } },
            { toPath: { contains: suffix } },
          ],
        },
      });
    } finally {
      await db.$disconnect();
    }
  });

  it("returns null for inactive, missing, or cyclic redirects", () => {
    assert.equal(
      resolveRedirectChain("/recipes/missing", () => null),
      null,
    );
    assert.equal(
      resolveRedirectChain("/recipes/old", () => ({
        toPath: "/recipes/new",
        isActive: false,
      })),
      null,
    );

    const cycle = new Map([
      ["/recipes/a", { toPath: "/recipes/b", isActive: true }],
      ["/recipes/b", { toPath: "/recipes/a", isActive: true }],
    ]);
    assert.equal(resolveRedirectChain("/recipes/a", (p) => cycle.get(p)), null);
  });

  it("wires saveRecipeAction to create redirects on published slug change", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /upsertRecipeSlugChangeRedirect/);
    assert.match(actions, /setRedirectActiveAction/);
    assert.match(actions, /wasPublished/);
  });

  it("resolves redirects on the public recipe page before notFound", () => {
    const page = read("app/recipes/[slug]/page.tsx");
    assert.match(page, /resolveActiveRedirect/);
    assert.match(page, /permanentRedirect/);
    assert.match(page, /loadRecipeOrRedirect/);
  });

  it("exposes an Admin Redirects page under Library content access", () => {
    const nav = read("lib/admin-nav.ts");
    assert.match(nav, /\/admin\/redirects/);
    assert.match(nav, /label: "Redirects"/);
    const page = read("app/admin/(app)/redirects/page.tsx");
    assert.match(page, /requireAccess\("content"\)/);
    assert.match(page, /setRedirectActiveAction/);
    assert.match(page, /listRedirectsForAdmin/);
  });

  it("defines Redirect model in Prisma schema", () => {
    const schema = readFileSync(
      path.join(srcRoot, "..", "prisma", "schema.prisma"),
      "utf8",
    );
    assert.match(schema, /model Redirect \{/);
    assert.match(schema, /fromPath\s+String\s+@unique/);
    assert.match(schema, /isActive\s+Boolean/);
  });
});
