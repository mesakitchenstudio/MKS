/**
 * Phase 12E — Newsletter marketing transport boundary contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("newsletter marketing email transport", () => {
  it("reuses transactional Resend adapter without altering call sites", () => {
    const marketing = read("lib/newsletter-marketing-email.ts");
    assert.match(marketing, /export async function sendNewsletterMarketingEmailDetailed/);
    assert.match(marketing, /sendTransactionalEmailDetailed/);
    assert.match(marketing, /isTransactionalEmailConfigured/);
    assert.doesNotMatch(marketing, /api\.resend\.com/i);

    const email = read("lib/email.ts");
    assert.match(email, /headers\?:/);
    // Transactional helpers remain for password reset / contact / welcome.
    assert.match(email, /sendTransactionalEmailDetailed/);

    const password = read("lib/reset-password.ts");
    assert.doesNotMatch(password, /sendNewsletterMarketingEmailDetailed/);
    assert.match(password, /sendTransactionalEmailDetailed/);

    const contact = read("lib/site-forms.ts");
    assert.doesNotMatch(contact, /sendNewsletterMarketingEmailDetailed/);
    assert.match(contact, /sendTransactionalEmail/);

    const welcome = read("lib/newsletter-subscribe.ts");
    assert.doesNotMatch(welcome, /sendNewsletterMarketingEmailDetailed/);
  });
});
