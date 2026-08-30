import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seriesItemListJsonLd, type PublicSeriesDetail } from "@/lib/series-types";

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
