import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipes } from "@/data/recipes";
import {
  CARD_TIME_SEMANTIC,
  cardDisplayMinutes,
  isLikelyExternalStockImageUrl,
  isRecognizedPublicRecipeImageUrl,
  listPublishContentWarnings,
} from "./recipe-catalog-integrity";
import { formatTime } from "./recipe-utils";

describe("recipe catalog integrity", () => {
  it("documents card time as canonical total minutes", () => {
    assert.equal(CARD_TIME_SEMANTIC, "total");
    const horchata = recipes.find((recipe) => recipe.slug === "iced-horchata-coffee");
    assert.ok(horchata);
    assert.equal(cardDisplayMinutes(horchata!), 15);
    assert.equal(formatTime(cardDisplayMinutes(horchata!)), "15 min");
  });

  it("recognizes allowed public image hosts", () => {
    assert.equal(
      isRecognizedPublicRecipeImageUrl(
        "https://images.unsplash.com/photo-1?auto=format&fit=crop",
      ),
      true,
    );
    assert.equal(
      isRecognizedPublicRecipeImageUrl("https://abc.public.blob.vercel-storage.com/hero.jpg"),
      true,
    );
    assert.equal(isRecognizedPublicRecipeImageUrl("/uploads/bread.jpg"), true);
    assert.equal(isRecognizedPublicRecipeImageUrl("https://example.com/food.jpg"), false);
  });

  it("flags unsplash URLs as external stock", () => {
    assert.equal(
      isLikelyExternalStockImageUrl("https://images.unsplash.com/photo-123"),
      true,
    );
    assert.equal(isLikelyExternalStockImageUrl("/uploads/recipe.jpg"), false);
  });

  it("warns on missing or risky hero image without blocking publish", () => {
    const empty = listPublishContentWarnings({ values: {} });
    assert.ok(empty.some((line) => line.includes("No hero image")));

    const unknownHost = listPublishContentWarnings({
      values: {
        image: "https://cdn.example.com/hero.jpg",
        prepMinutes: 10,
        servings: 4,
      },
    });
    assert.ok(unknownHost.some((line) => line.includes("may not load")));

    const stock = listPublishContentWarnings({
      values: {
        image: "https://images.unsplash.com/photo-123",
        prepMinutes: 10,
        servings: 4,
      },
    });
    assert.ok(stock.some((line) => line.includes("stock photography")));
  });

  it("warns when timing or yield fields are absent", () => {
    const warnings = listPublishContentWarnings({
      values: { image: "/uploads/hero.jpg" },
    });
    assert.ok(warnings.some((line) => line.includes("Preparation time")));
    assert.ok(warnings.some((line) => line.includes("Yield")));
  });
});
