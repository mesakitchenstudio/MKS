import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PRIMARY_CATEGORY_LABELS, PRIMARY_CATEGORY_SLUGS } from "./recipe-primary-taxonomy";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("public footer polish", () => {
  it("keeps dark editorial chrome and adds Videos to Site links", () => {
    const footer = read("components/SiteFooter.tsx");
    assert.match(footer, /bg-ink text-cream/);
    assert.match(footer, /<footer/);
    assert.match(footer, /href: "\/videos", label: "Videos"/);
    assert.match(footer, /About/);
    assert.match(footer, /Contact/);
    assert.match(footer, /Privacy/);
    assert.match(footer, /Disclosures/);

    const about = footer.indexOf('href: "/about"');
    const videos = footer.indexOf('href: "/videos"');
    const contact = footer.indexOf('href: "/contact"');
    assert.ok(about > 0 && videos > about && contact > videos);
  });

  it("preserves Explore primary categories and newsletter copy", () => {
    const footer = read("components/SiteFooter.tsx");
    assert.match(footer, /PRIMARY_CATEGORY_SLUGS/);
    for (const slug of PRIMARY_CATEGORY_SLUGS) {
      assert.ok(PRIMARY_CATEGORY_LABELS[slug]);
    }
    assert.match(
      footer,
      /New recipes and seasonal notes, sent when we have something worth the inbox\./,
    );
    assert.match(footer, /Instagram/);
    assert.match(footer, /Pinterest/);
    assert.match(footer, /YouTube/);
    assert.match(footer, /Made with ❤️ in Istanbul/);
    assert.match(footer, /md:grid-cols-3/);
    assert.doesNotMatch(footer, /gradient|shadow|fa-instagram|svg.*youtube/i);
  });

  it("uses measured column proportions and tighter spacing", () => {
    const footer = read("components/SiteFooter.tsx");
    assert.match(footer, /1\.2fr_0\.8fr_0\.8fr_minmax\(0,1\.35fr\)/);
    assert.match(footer, /py-11/);
    assert.match(footer, /py-4/);
    assert.match(footer, /focus-visible:outline-terracotta/);
    assert.match(footer, /max-w-6xl/);
  });

  it("keeps newsletter a11y and modestly wider dark input", () => {
    const form = read("components/NewsletterForm.tsx");
    assert.match(form, /sr-only/);
    assert.match(form, /Email address/);
    assert.match(form, /min-h-11/);
    assert.match(form, /flex-\[1\.45\]/);
    assert.match(form, /type="submit"/);
  });
});
