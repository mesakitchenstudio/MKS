import assert from "node:assert/strict";
import { test } from "node:test";
import { fieldKindUsesOptions, partitionTypeFields } from "./field-admin";
import { keyFromLabel } from "./fields";

test("keyFromLabel generates camelCase keys", () => {
  assert.equal(keyFromLabel("Cake height"), "cakeHeight");
  assert.equal(keyFromLabel("Frosting notes"), "frostingNotes");
});

test("fieldKindUsesOptions is true only for select", () => {
  assert.equal(fieldKindUsesOptions("select"), true);
  assert.equal(fieldKindUsesOptions("text"), false);
  assert.equal(fieldKindUsesOptions("ingredients"), false);
});

test("partitionTypeFields preserves sortOrder within each group", () => {
  const fields = [
    {
      id: "1",
      key: "a",
      label: "A",
      helpText: "",
      kind: "text",
      required: false,
      options: [],
      sortOrder: 20,
      isShared: false,
      globalIndex: 2,
    },
    {
      id: "2",
      key: "b",
      label: "B",
      helpText: "",
      kind: "text",
      required: false,
      options: [],
      sortOrder: 8,
      isShared: false,
      globalIndex: 1,
    },
    {
      id: "3",
      key: "c",
      label: "C",
      helpText: "",
      kind: "text",
      required: false,
      options: [],
      sortOrder: 0,
      isShared: true,
      globalIndex: 0,
    },
  ];
  const { typeSpecific, shared } = partitionTypeFields(fields);
  assert.equal(typeSpecific.length, 2);
  assert.equal(typeSpecific[0]?.key, "b");
  assert.equal(typeSpecific[1]?.key, "a");
  assert.equal(shared.length, 1);
  assert.equal(shared[0]?.key, "c");
});
