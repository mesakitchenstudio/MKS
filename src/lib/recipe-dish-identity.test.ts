import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isTrustworthyDishLabel,
  looksLikeTopicTitle,
  resolveRecipeCardTitle,
  resolveRecipeDishIdentity,
} from "./recipe-dish-identity";

test("looksLikeTopicTitle detects how-to headlines", () => {
  assert.equal(
    looksLikeTopicTitle("Why Your Homemade Bread Isn't Crusty (And How to Fix It)"),
    true,
  );
  assert.equal(looksLikeTopicTitle("Herb Focaccia"), false);
});

test("isTrustworthyDishLabel rejects image-alt sentences", () => {
  assert.equal(
    isTrustworthyDishLabel(
      "Four golden crispy French baguettes resting in a cloth-lined basket",
    ),
    false,
  );
  assert.equal(isTrustworthyDishLabel("Crusty French Baguettes"), true);
});

test("resolveRecipeDishIdentity never uses image-alt-like text", () => {
  assert.equal(
    resolveRecipeDishIdentity({
      title: "Why Your Homemade Bread Isn't Crusty (And How to Fix It)",
      course: "Breads",
      typeName: "Bread",
      seriesItemTitles: [
        "Four golden crispy French baguettes resting in a cloth-lined basket",
      ],
    }),
    null,
  );
});

test("resolveRecipeDishIdentity prefers dishName", () => {
  assert.equal(
    resolveRecipeDishIdentity({
      title: "Why Your Homemade Bread Isn't Crusty (And How to Fix It)",
      course: "Breads",
      dishName: "Crusty French Baguettes",
      typeName: "Bread",
    }),
    "Crusty French Baguettes",
  );
});

test("resolveRecipeDishIdentity uses series item title when trustworthy", () => {
  assert.equal(
    resolveRecipeDishIdentity({
      title: "Why Your Homemade Bread Isn't Crusty (And How to Fix It)",
      course: "Breads",
      typeName: "Bread",
      seriesItemTitles: ["French Baguettes"],
    }),
    "French Baguettes",
  );
});

test("resolveRecipeDishIdentity skips when title is already the dish", () => {
  assert.equal(
    resolveRecipeDishIdentity({
      title: "Herb Focaccia",
      course: "Bread",
      typeName: "Bread",
    }),
    null,
  );
});

test("resolveRecipeCardTitle prefers trustworthy dishName over topic titles", () => {
  assert.equal(
    resolveRecipeCardTitle({
      title: "I Make This Creamy Mushroom Pasta 3 Times a Week!",
      dishName: "Creamy Mushroom Pasta",
    }),
    "Creamy Mushroom Pasta",
  );
  assert.equal(
    resolveRecipeCardTitle({
      title: "Chocolate Chunk Cookies",
      dishName: "",
    }),
    "Chocolate Chunk Cookies",
  );
  assert.equal(
    resolveRecipeCardTitle({
      title: "You Won't Believe This Homemade Chocolate is So Simple to Make",
    }),
    "You Won't Believe This Homemade Chocolate is So Simple to Make",
  );
});

test("resolveRecipeCardTitle rejects untrustworthy dishName fallbacks", () => {
  assert.equal(
    resolveRecipeCardTitle({
      title: "Classic French Baguettes",
      dishName: "Four golden baguettes resting in a cloth-lined basket",
    }),
    "Classic French Baguettes",
  );
});
