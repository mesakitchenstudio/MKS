import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isTrustworthyDishLabel,
  looksLikeTopicTitle,
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
