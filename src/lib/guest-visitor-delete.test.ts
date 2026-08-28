import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("guest visitor deletion", () => {
  it("cascades GuestPageView rows when a GuestVisitor is deleted", () => {
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    assert.match(
      schema,
      /model GuestPageView[\s\S]*visitor\s+GuestVisitor @relation\(fields: \[visitorId\], references: \[id\], onDelete: Cascade\)/,
    );
  });

  it("keeps registered members in a separate User model", () => {
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    assert.match(schema, /model User \{[\s\S]*model GuestVisitor \{/);
    assert.doesNotMatch(schema, /model GuestVisitor[\s\S]*userId/);
  });
});
