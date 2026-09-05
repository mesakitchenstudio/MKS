import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickSeriesPreviewItems } from "@/lib/series-types";
import { seriesItemListJsonLd, type PublicSeriesDetail, type PublicSeriesItem } from "@/lib/series-types";

function sampleItem(overrides: Partial<PublicSeriesItem> = {}): PublicSeriesItem {
  return {
    id: "i1",
    position: 1,
    title: "Item One",
    description: "",
    featured: false,
    thumbnail: "/one.jpg",
    recipeId: null,
    recipeSlug: null,
    recipeTitle: null,
    youtubeVideoId: null,
    youtubeTitle: null,
    durationDisplay: "",
    watchUrl: null,
    typeName: "",
    categorySlugs: [],
    ...overrides,
  };
}

describe("series schema", () => {
  it("builds ItemList JSON-LD without Recipe type on the series page", () => {
    const series: PublicSeriesDetail = {
      id: "s1",
      slug: "bread-basics",
      title: "Bread Basics",
      shortTitle: "Bread",
      description: "Learn bread fundamentals.",
      intro: "",
      heroImage: "",
      seoTitle: "",
      seoDescription: "",
      itemCount: 1,
      featured: null,
      items: [
        {
          id: "i1",
          position: 1,
          title: "Soft Stovetop Flatbread",
          description: "",
          featured: true,
          thumbnail: "/x.jpg",
          recipeId: "r1",
          recipeSlug: "soft-stovetop-flatbread",
          recipeTitle: "Soft Stovetop Flatbread",
          youtubeVideoId: "abcdefghijk",
          youtubeTitle: "Flatbread",
          durationDisplay: "10:00",
          watchUrl: "https://www.youtube.com/watch?v=abcdefghijk",
          typeName: "Bread",
          categorySlugs: ["breads"],
        },
      ],
    };
    const json = seriesItemListJsonLd(series);
    assert.equal(json["@type"], "ItemList");
    assert.notEqual(json["@type"], "Recipe");
    assert.equal(json.numberOfItems, 1);
    const first = (json.itemListElement as Array<{ url?: string }>)[0];
    assert.ok(first.url?.includes("/recipes/soft-stovetop-flatbread"));
  });
});

describe("pickSeriesPreviewItems", () => {
  it("prefers featured items then catalog order, capped at two", () => {
    const items = [
      sampleItem({ id: "a", position: 1, title: "A", featured: false }),
      sampleItem({ id: "b", position: 2, title: "B", featured: true, thumbnail: "/b.jpg" }),
      sampleItem({ id: "c", position: 3, title: "C", featured: false }),
      sampleItem({ id: "d", position: 4, title: "D", featured: true }),
    ];
    const previews = pickSeriesPreviewItems(items, 2);
    assert.equal(previews.length, 2);
    assert.deepEqual(
      previews.map((p) => p.id),
      ["b", "d"],
    );
    assert.equal(previews[0]?.thumbnail, "/b.jpg");
  });

  it("falls back to order when nothing is featured", () => {
    const items = [
      sampleItem({ id: "a", position: 1, title: "A" }),
      sampleItem({ id: "b", position: 2, title: "B" }),
      sampleItem({ id: "c", position: 3, title: "C" }),
    ];
    assert.deepEqual(
      pickSeriesPreviewItems(items).map((p) => p.id),
      ["a", "b"],
    );
  });
});
