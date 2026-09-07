import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getRecipePublishingReadiness } from "./recipe-publishing-readiness.ts";
import {
  applyMediaAssetToRecipeValues,
  clearRecipeHeroMediaAssetId,
  filterMediaAssets,
  getRecipeHeroMediaAssetId,
  mediaAssetDisplayTitle,
  RECIPE_HERO_MEDIA_ASSET_ID_KEY,
  sortMediaAssetsForLibrary,
  titleFromUploadFilename,
  type MediaAssetRecord,
} from "./media-asset.ts";
import { buildAdminNavSections } from "./admin-nav.ts";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), "src", rel), "utf8");
}

function fixtureAsset(partial: Partial<MediaAssetRecord> = {}): MediaAssetRecord {
  return {
    id: partial.id ?? "asset_1",
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-01-02T00:00:00.000Z",
    url: partial.url ?? "https://example.public.blob.vercel-storage.com/flatbread.jpg",
    title: partial.title ?? "Soft flatbread hero",
    altText: partial.altText ?? "Soft stovetop flatbread on a board",
    credit: partial.credit ?? "",
    notes: partial.notes ?? "",
    mimeType: partial.mimeType ?? "image/jpeg",
    byteSize: partial.byteSize ?? 12000,
    source: partial.source ?? "upload",
    kind: partial.kind ?? "recipe_hero",
    isActive: partial.isActive ?? true,
    createdByAdminId: partial.createdByAdminId ?? null,
  };
}

describe("phase 6B — MediaAsset ownership vs storage", () => {
  it("keeps storage upload route bytes-first and MediaAsset optional via registerMedia", () => {
    const upload = read("app/api/admin/upload/route.ts");
    assert.match(upload, /storeAdminImage/);
    assert.match(upload, /registerMedia/);
    assert.match(upload, /registerMediaAssetFromUpload/);
    assert.match(upload, /shouldRegister/);
    assert.match(upload, /\["recipes", "series", "media"\]/);
    assert.match(upload, /Admin profile photos never enter the Media Library/);
  });

  it("does not place Prisma or MediaAsset logic inside admin-upload-store", () => {
    const store = read("lib/admin-upload-store.ts");
    assert.doesNotMatch(store, /MediaAsset|mediaAsset|prisma/i);
    assert.match(store, /storeAdminImage/);
  });
});

describe("phase 6B — recipe linkage helpers", () => {
  it("applies asset URL + id and fills empty alt only", () => {
    const withEmptyAlt = applyMediaAssetToRecipeValues(
      { image: "", imageAlt: "" },
      fixtureAsset(),
    );
    assert.equal(withEmptyAlt.image, fixtureAsset().url);
    assert.equal(withEmptyAlt[RECIPE_HERO_MEDIA_ASSET_ID_KEY], "asset_1");
    assert.equal(withEmptyAlt.imageAlt, fixtureAsset().altText);

    const keepAlt = applyMediaAssetToRecipeValues(
      { image: "", imageAlt: "Keep me" },
      fixtureAsset(),
      { fillEmptyAltOnly: true },
    );
    assert.equal(keepAlt.imageAlt, "Keep me");
  });

  it("clears library linkage on manual URL edit helpers", () => {
    const linked = applyMediaAssetToRecipeValues({}, fixtureAsset());
    assert.equal(getRecipeHeroMediaAssetId(linked), "asset_1");
    const cleared = clearRecipeHeroMediaAssetId({ ...linked, image: "https://example.com/x.jpg" });
    assert.equal(getRecipeHeroMediaAssetId(cleared), null);
  });

  it("does not change publishing readiness ownership when attaching a recognized hero URL", () => {
    const fields = [
      { key: "image", label: "Hero", kind: "image", required: true },
      { key: "imageAlt", label: "Alt", kind: "text", required: true },
      { key: "intro", label: "Intro", kind: "textarea", required: true },
      { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
      { key: "instructions", label: "Instructions", kind: "instructions", required: true },
      { key: "prepMinutes", label: "Prep", kind: "minutes", required: true },
      { key: "servings", label: "Servings", kind: "number", required: true },
    ];
    const baseValues = {
      intro: "A soft flatbread.",
      ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
      instructions: [{ title: "Mix", steps: ["Combine flour and water."] }],
      imageAlt: "Soft stovetop flatbread on a board",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      prepMinutes: 10,
      servings: 4,
      image: fixtureAsset().url,
    };
    const withoutAsset = getRecipePublishingReadiness({
      title: "Soft Flatbread",
      slug: "soft-flatbread",
      excerpt: "Soft and flexible.",
      typeId: "t1",
      fields,
      values: baseValues,
    });
    const withAsset = getRecipePublishingReadiness({
      title: "Soft Flatbread",
      slug: "soft-flatbread",
      excerpt: "Soft and flexible.",
      typeId: "t1",
      fields,
      values: applyMediaAssetToRecipeValues(baseValues, fixtureAsset()),
    });
    assert.equal(withAsset.status, withoutAsset.status);
    assert.deepEqual(
      withAsset.required.map((check) => `${check.id}:${check.passed}`),
      withoutAsset.required.map((check) => `${check.id}:${check.passed}`),
    );
  });
});

describe("phase 6B — library filters and identity", () => {
  it("filters inactive assets out of picker-oriented active filter", () => {
    const rows = [
      fixtureAsset({ id: "a", isActive: true, title: "Active loaf" }),
      fixtureAsset({ id: "b", isActive: false, title: "Retired loaf", updatedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    const active = filterMediaAssets(rows, { active: "active" });
    assert.deepEqual(
      active.map((row) => row.id),
      ["a"],
    );
    const sorted = sortMediaAssetsForLibrary(rows);
    assert.equal(sorted[0]?.id, "a");
  });

  it("keeps stable id display when title empty", () => {
    assert.equal(
      mediaAssetDisplayTitle(fixtureAsset({ title: "", url: "/uploads/hero-bread.jpg" })),
      "hero-bread.jpg",
    );
    assert.equal(titleFromUploadFilename("soft-stovetop-flatbread.jpg"), "soft stovetop flatbread");
  });

  it("slug rename does not invent a new media identity helper key", () => {
    const values = applyMediaAssetToRecipeValues({ slug: "old" }, fixtureAsset());
    const renamed = { ...values, slug: "new-slug" };
    assert.equal(getRecipeHeroMediaAssetId(renamed), "asset_1");
  });
});

describe("phase 6B — admin surface wiring", () => {
  it("exposes Media under Library with content permission", () => {
    const editor = buildAdminNavSections("editor");
    const library = editor.find((section) => section.id === "library");
    assert.ok(library?.items.some((item) => item.href === "/admin/media" && item.label === "Media"));
    const audience = buildAdminNavSections("members");
    assert.equal(
      audience.some((section) => section.items.some((item) => item.href === "/admin/media")),
      false,
    );
  });

  it("wires Media pages, actions, and picker API", () => {
    const page = read("app/admin/(app)/media/page.tsx");
    const detail = read("app/admin/(app)/media/[id]/page.tsx");
    const actions = read("app/admin/media-actions.ts");
    const api = read("app/api/admin/media/route.ts");
    const editor = read("components/admin/RecipeEditor.tsx");
    assert.match(page, /requireAccess\("content"\)/);
    assert.match(page, /listMediaAssetsForAdmin/);
    assert.match(detail, /listMediaAssetUsages/);
    assert.match(actions, /media\.updated/);
    assert.match(api, /listActiveMediaAssetsForPicker/);
    assert.match(editor, /MediaAssetPickerButton/);
    assert.match(editor, /registerMedia/);
    assert.match(editor, /applyMediaAssetToRecipeValues/);
  });

  it("does not import Content Health or Search analytics into MediaAsset helpers", () => {
    const pure = read("lib/media-asset.ts");
    const server = read("lib/media-asset-server.ts");
    assert.doesNotMatch(pure, /SearchEvent|getRecipeContentHealth|contentHealthScore/i);
    assert.doesNotMatch(server, /SearchEvent|FunnelEvent|contentHealthScore/i);
  });

  it("schema defines MediaAsset without RecipeHealthScore persistence", () => {
    const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    assert.match(schema, /model MediaAsset/);
    assert.doesNotMatch(schema, /RecipeHealthScore|MediaHealthScore/);
    assert.match(schema, /Editorial media catalogue/);
  });
});
