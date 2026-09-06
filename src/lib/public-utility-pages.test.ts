import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

describe("public utility pages polish", () => {
  it("contact keeps two-column editorial intro and working form fields", () => {
    const page = read("app/contact/page.tsx");
    const form = read("components/ContactForm.tsx");
    assert.match(page, /Say hello/);
    assert.match(page, /Recipe questions/);
    assert.match(page, /Partnerships/);
    assert.match(page, /Corrections/);
    assert.match(page, /mailto:\$\{site\.email\}/);
    assert.match(page, /md:grid-cols-2/);
    assert.match(form, /name="name"/);
    assert.match(form, /name="email"/);
    assert.match(form, /name="message"/);
    assert.match(form, /Thanks for writing to us/);
    assert.match(form, /\/api\/contact/);
    assert.match(form, /sm:w-auto sm:justify-self-start/);
    assert.doesNotMatch(form, /name="topic"|Topic/);
  });

  it("privacy uses factual sections and accurate deletion wording", () => {
    const privacy = read("app/privacy/page.tsx");
    assert.match(privacy, /title:\s*"Privacy Policy"/);
    assert.match(privacy, /Last updated September 6, 2026/);
    assert.match(privacy, /Account deletion/);
    assert.match(privacy, /When you[\s\S]*delete your account/i);
    assert.match(privacy, /Published[\s\S]*reviews may remain without a link to your former account/i);
    assert.match(privacy, /unsubscribed state so we can honor that preference/i);
    assert.match(privacy, /welcome message/);
    assert.match(privacy, /unsubscribe at any time/i);
    assert.match(privacy, /first-party visitor analytics/i);
    assert.match(privacy, /Google account/);
    assert.match(privacy, /Third-party services/);
    assert.match(privacy, /Cookies &amp; preferences/);
    assert.match(privacy, /Privacy preferences/);
    const thirdPartyIdx = privacy.indexOf("Third-party services");
    const youtubeIdx = privacy.indexOf(
      "Embedded YouTube videos are loaded from YouTube when you play them",
    );
    const emailProviderIdx = privacy.indexOf(
      "email provider when that service is configured",
    );
    assert.ok(thirdPartyIdx > 0);
    assert.ok(youtubeIdx > thirdPartyIdx);
    assert.ok(emailProviderIdx > thirdPartyIdx);
    assert.doesNotMatch(privacy, /all personal data is permanently erased/i);
    assert.doesNotMatch(privacy, /GDPR|CCPA|sell your data to advertisers/i);
  });

  it("disclosures match current commercial and nutrition state", () => {
    const disclosures = read("app/disclosures/page.tsx");
    assert.match(disclosures, /title:\s*"Disclosures"/);
    assert.match(disclosures, /no affiliate links and no sponsored recipes/i);
    assert.match(disclosures, /labeled as an estimate/i);
    assert.match(disclosures, /licensed photography/i);
    assert.match(disclosures, /not currently displaying advertising/i);
    assert.doesNotMatch(disclosures, /standard ingredient data/i);
    assert.doesNotMatch(disclosures, /AdSense|currently serve ads/i);
  });
});
