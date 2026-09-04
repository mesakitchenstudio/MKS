import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { normalizeGuestVisitorIds } from "./guest-tracking.ts";

describe("guest visitor deletion", () => {
  it("dedupes and trims visitor ids for bulk delete", () => {
    assert.deepEqual(
      normalizeGuestVisitorIds([" abc ", "abc", "", "  ", "def"]),
      ["abc", "def"],
    );
  });

  it("cascades GuestPageView rows when a GuestVisitor is deleted", () => {
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    assert.match(
      schema,
      /model GuestPageView[\s\S]*visitor\s+GuestVisitor @relation\(fields: \[visitorId\], references: \[id\], onDelete: Cascade\)/,
    );
  });

  it("cascades FunnelEvent and GuestPresenceSession with GuestVisitor", () => {
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    assert.match(
      schema,
      /model FunnelEvent[\s\S]*visitor\s+GuestVisitor @relation\(fields: \[visitorId\], references: \[id\], onDelete: Cascade\)/,
    );
    assert.match(
      schema,
      /model GuestPresenceSession[\s\S]*visitor\s+GuestVisitor @relation\(fields: \[visitorId\], references: \[id\], onDelete: Cascade\)/,
    );
  });

  it("admin delete helper clears presence before deleting visitors", () => {
    const source = readFileSync(new URL("./guest-analytics.ts", import.meta.url), "utf8");
    assert.match(
      source,
      /guestPresenceSession\.deleteMany\([\s\S]*guestVisitor\.deleteMany/,
    );
  });

  it("keeps registered members in a separate User model", () => {
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    assert.match(schema, /model User \{[\s\S]*model GuestVisitor \{/);
    assert.doesNotMatch(schema, /model GuestVisitor[\s\S]*userId/);
  });
});
