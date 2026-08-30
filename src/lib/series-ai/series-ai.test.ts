import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectSeriesHero, suggestFeaturedItemId, type SeriesAiContext } from "@/lib/series-ai/selection";
import {
  noteSeriesHumanEdit,
  shouldApplySeriesAiField,
} from "@/lib/series-ai/provenance";
import { emptySeriesAiMeta } from "@/lib/series-ai/types";

function baseContext(overrides: Partial<SeriesAiContext> = {}): SeriesAiContext {
  return {
    seriesId: "s1",
    slug: "breads",
    title: "Breads",
    shortTitle: "",
    description: "",
    intro: "",
    seoTitle: "",
    seoDescription: "",
    heroImage: "",
    heroImageSource: "",
    syncMode: "YOUTUBE",
    youtubePlaylistId: "PLtest",
    youtubePlaylistTitle: "Breads",
    youtubePlaylistDescription: "Bread videos",
    youtubePlaylistThumbnail: "https://i.ytimg.com/vi/playlist.jpg",
    items: [
      {
        itemId: "i1",
        sortOrder: 0,
        featured: true,
        customTitle: "",
        customDescription: "",
        recipe: {
          id: "r1",
          title: "Soft Stovetop Flatbread",
          slug: "flatbread",
          excerpt: "Everyday flatbread",
          status: "published",
          typeName: "Bread",
          categoryNames: ["Breads"],
          intro: "A soft flatbread.",
          whyItWorks: "",
          keyIngredients: "flour",
          image: "https://example.com/flatbread.jpg",
          tags: [],
        },
        video: {
          videoId: "aaaaaaaaaaa",
          title: "Flatbread Video",
          description: "Make flatbread",
          tags: ["bread"],
          durationDisplay: "10:00",
          durationSeconds: 600,
          format: "LONG",
          thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
        },
      },
      {
        itemId: "i2",
        sortOrder: 1,
        featured: false,
        customTitle: "",
        customDescription: "",
        recipe: {
          id: "r2",
          title: "Crisp Crust Tips",
          slug: "crust",
          excerpt: "Crust technique",
          status: "published",
          typeName: "Bread",
          categoryNames: ["Breads"],
          intro: "",
          whyItWorks: "",
          keyIngredients: "",
          image: "",
          tags: [],
        },
        video: {
          videoId: "W_bykMwhJXk",
          title: "Why Your Homemade Bread Isn't Crusty (And How to Fix It)",
          description: "500g bread flour…",
          tags: ["bread", "crust"],
          durationDisplay: "8:00",
          durationSeconds: 480,
          format: "LONG",
          thumbnailUrl: "https://i.ytimg.com/vi/W_bykMwhJXk/hqdefault.jpg",
        },
      },
    ],
    ...overrides,
  };
}

describe("series AI hero + featured", () => {
  it("prefers featured recipe hero", () => {
    const selected = selectSeriesHero(baseContext());
    assert.equal(selected?.source, "auto_featured_recipe");
    assert.match(selected?.url || "", /flatbread/);
  });

  it("falls back to playlist thumbnail", () => {
    const selected = selectSeriesHero(
      baseContext({
        items: baseContext().items.map((item) => ({
          ...item,
          recipe: item.recipe ? { ...item.recipe, image: "" } : null,
          video: item.video ? { ...item.video, thumbnailUrl: "" } : null,
          featured: false,
        })),
      }),
    );
    assert.equal(selected?.source, "auto_playlist");
  });

  it("never replaces manual hero", () => {
    const selected = selectSeriesHero(
      baseContext({
        heroImage: "https://example.com/manual.jpg",
        heroImageSource: "manual",
      }),
    );
    assert.equal(selected?.source, "manual");
    assert.match(selected?.url || "", /manual/);
  });

  it("suggests published long-form recipe item as featured", () => {
    assert.equal(suggestFeaturedItemId(baseContext({ items: baseContext().items.map((i) => ({ ...i, featured: false })) })), "i1");
  });
});

describe("series AI provenance", () => {
  it("marks genuine human edits only", () => {
    let meta = emptySeriesAiMeta();
    meta = {
      ...meta,
      generatedByAI: true,
      fieldProvenance: {
        description: {
          aiGenerated: true,
          aiGeneratedValue: "AI description",
          humanModifiedAfterGeneration: false,
        },
      },
    };
    meta = noteSeriesHumanEdit(meta, "description", "AI description");
    assert.equal(meta.fieldProvenance?.description?.humanModifiedAfterGeneration, false);
    meta = noteSeriesHumanEdit(meta, "description", "Human description");
    assert.equal(meta.fieldProvenance?.description?.humanModifiedAfterGeneration, true);
  });

  it("fill_empty skips non-empty fields", () => {
    const meta = {
      ...emptySeriesAiMeta(),
      fieldProvenance: {
        description: {
          aiGenerated: true,
          aiGeneratedValue: "AI",
          humanModifiedAfterGeneration: false,
        },
      },
    };
    assert.equal(
      shouldApplySeriesAiField({
        path: "description",
        mode: "fill_empty",
        meta,
        isEmpty: false,
      }),
      false,
    );
    assert.equal(
      shouldApplySeriesAiField({
        path: "description",
        mode: "fill_empty",
        meta,
        isEmpty: true,
      }),
      true,
    );
  });

  it("replace_ai preserves human-modified non-empty fields", () => {
    const meta = {
      ...emptySeriesAiMeta(),
      fieldProvenance: {
        description: {
          aiGenerated: true,
          aiGeneratedValue: "AI",
          humanModifiedAfterGeneration: true,
        },
      },
    };
    assert.equal(
      shouldApplySeriesAiField({
        path: "description",
        mode: "replace_ai",
        meta,
        isEmpty: false,
      }),
      false,
    );
    assert.equal(
      shouldApplySeriesAiField({
        path: "shortTitle",
        mode: "replace_ai",
        meta,
        isEmpty: true,
      }),
      true,
    );
  });
});
