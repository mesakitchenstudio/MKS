import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateNewsletterEmail } from "./newsletter.ts";

describe("newsletter", () => {
  it("rejects empty email", () => {
    const result = validateNewsletterEmail("   ");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /email/i);
  });

  it("rejects invalid email", () => {
    const result = validateNewsletterEmail("not-an-email");
    assert.equal(result.ok, false);
  });

  it("accepts valid email", () => {
    const result = validateNewsletterEmail("  Cook@Example.com ");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.email, "cook@example.com");
  });
});
