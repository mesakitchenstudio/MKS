import assert from "node:assert/strict";
import { test } from "node:test";
import { stripSearchParams } from "./admin-transient-feedback";

test("stripSearchParams removes transient keys and keeps the field hash", () => {
  assert.equal(
    stripSearchParams(
      "http://localhost/admin/types/abc?saved=field&fieldId=fld-1#field-fld-1",
      ["saved", "fieldId"],
    ),
    "/admin/types/abc#field-fld-1",
  );
});

test("stripSearchParams removes deleted status and keeps the categories hash", () => {
  assert.equal(
    stripSearchParams(
      "http://localhost/admin/categories?deleted=category#categories",
      ["deleted"],
    ),
    "/admin/categories#categories",
  );
});

test("stripSearchParams removes review removed flag and keeps pagination", () => {
  assert.equal(
    stripSearchParams("http://localhost/admin/reviews?removed=1&page=2", ["removed"]),
    "/admin/reviews?page=2",
  );
  assert.equal(
    stripSearchParams("http://localhost/admin/reviews?removed=1", ["removed"]),
    "/admin/reviews",
  );
});

test("stripSearchParams preserves unrelated query params", () => {
  assert.equal(
    stripSearchParams(
      "http://localhost/admin/types/abc?saved=type&focus=x",
      ["saved"],
    ),
    "/admin/types/abc?focus=x",
  );
});
