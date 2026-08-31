import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRecipeDishIdentity, looksLikeTopicTitle } from "./recipe-dish-identity";

test("looksLikeTopicTitle detects how-to headlines", () => {
  assert.equal(
    looksLikeTopicTitle("Why Your Homemade Bread Isn't Crusty (And How to Fix It)"),
    true,
  );
  assert.equal(looksLikeTopicTitle("Herb Focaccia"), false);
});

test("resolveRecipeDishIdentity prefers dishName", () => {
  assert.equal(
    resolveRecipeDishIdentity({
      title: "Why Your Homemade Bread Isn't Crusty (And How to Fix It)",
      course: "Breads",
      dishName: "Crusty French Baguettes",
      typeName: "Bread",
      imageAlt: "Baguettes",
    }),
    "Crusty French Baguettes",
  );
});

test("resolveRecipeDishIdentity falls back to typeName for topic titles", () => {
  assert.equal(
    resolveRecipeDishIdentity({
      title: "Why Your Homemade Bread Isn't Crusty?",
      course: "Breads",
      typeName: "French Baguettes",
      imageAlt: "Why Your Homemade Bread Isn't Crusty?",
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
      imageAlt: "Herb Focaccia",
    }),
    null,
  );
});
