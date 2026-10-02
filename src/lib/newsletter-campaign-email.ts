/**
 * Phase 12C — Newsletter campaign email renderer (pure).
 *
 * Consumes resolved presentation cards only — no DB, provider transport, or member PII.
 * Provider list-header fields belong to 12E send orchestration.
 */

import { site } from "@/data/site";
import type { NewsletterCampaignEmailRecipeCard } from "@/lib/newsletter-campaign";

const cream = "#f6f0e6";
const paper = "#fffcf7";
const ink = "#2a2218";
const muted = "#6b5e4e";
const terracotta = "#ad4b31";
const olive = "#5c6b4a";
const line = "#d9cbb6";
const sans =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const serif = "Georgia,'Times New Roman',Times,serif";

export const NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING = "Recipes for you";
export const NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING = "From the studio";
export const NEWSLETTER_CAMPAIGN_EMAIL_CTA = "View recipe";

export function escapeNewsletterEmailText(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeNewsletterEmailAttribute(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;");
}

/** Only http(s) absolute URLs — reject javascript:/data:/relative. */
export function isSafeNewsletterEmailHref(url: string | null | undefined): boolean {
  const raw = String(url ?? "").trim();
  if (!raw) return false;
  if (!/^https:\/\//i.test(raw) && !/^http:\/\//i.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isSafeNewsletterEmailImageSrc(url: string | null | undefined): boolean {
  return isSafeNewsletterEmailHref(url);
}

export type NewsletterCampaignEmailInput = {
  subject: string;
  preheader?: string;
  intro: string;
  featured?: NewsletterCampaignEmailRecipeCard | null;
  blockRecipes: NewsletterCampaignEmailRecipeCard[];
  /** personalized | fallback — drives neutral section heading only. */
  blockMode: "personalized" | "fallback";
  unsubscribeUrl: string;
  /** Optional footer note (e.g. Owner test-send disclaimer). Plain text; escaped. */
  footerNote?: string | null;
};

export type NewsletterCampaignEmailRenderResult = {
  subject: string;
  html: string;
  text: string;
};

function renderRecipeCardHtml(card: NewsletterCampaignEmailRecipeCard): string {
  if (!isSafeNewsletterEmailHref(card.href)) return "";
  const title = escapeNewsletterEmailText(card.title || "Recipe");
  const href = escapeNewsletterEmailAttribute(card.href);
  const image =
    isSafeNewsletterEmailImageSrc(card.imageUrl) && card.imageUrl
      ? `<tr>
              <td style="padding:0 0 12px;">
                <a href="${href}" style="text-decoration:none;">
                  <img src="${escapeNewsletterEmailAttribute(card.imageUrl)}" alt="${escapeNewsletterEmailAttribute(card.imageAlt || card.title || "Recipe")}" width="516" style="display:block;width:100%;max-width:516px;height:auto;border:0;border-radius:2px;" />
                </a>
              </td>
            </tr>`
      : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px;">
          ${image}
          <tr>
            <td style="font-family:${serif};font-size:22px;line-height:1.3;color:${ink};padding:0 0 8px;">
              <a href="${href}" style="color:${ink};text-decoration:none;">${title}</a>
            </td>
          </tr>
          <tr>
            <td style="font-family:${sans};font-size:14px;line-height:1.4;padding:0;">
              <a href="${href}" style="color:${terracotta};font-weight:600;text-decoration:underline;">${NEWSLETTER_CAMPAIGN_EMAIL_CTA}</a>
            </td>
          </tr>
        </table>`;
}

/**
 * Pure campaign marketing email. Escapes all editorial/Recipe text.
 * Reasons / member IDs / emails must never be passed into this input.
 */
export function buildNewsletterCampaignEmail(
  input: NewsletterCampaignEmailInput,
): NewsletterCampaignEmailRenderResult {
  const subject = String(input.subject ?? "").trim() || site.name;
  const preheader = String(input.preheader ?? "").trim();
  const intro = String(input.intro ?? "").trim();
  const unsubscribeUrl = String(input.unsubscribeUrl ?? "").trim();
  const footerNote = String(input.footerNote ?? "").trim();
  const blockHeading =
    input.blockMode === "personalized"
      ? NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING
      : NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING;

  const featured =
    input.featured && isSafeNewsletterEmailHref(input.featured.href) ? input.featured : null;
  const blockRecipes = (input.blockRecipes ?? []).filter((card) =>
    isSafeNewsletterEmailHref(card.href),
  );

  const textLines = [
    subject,
    "",
    intro,
    "",
  ];
  if (featured) {
    textLines.push("Featured", featured.title, featured.href, "");
  }
  if (blockRecipes.length) {
    textLines.push(blockHeading, "");
    for (const card of blockRecipes) {
      textLines.push(card.title, card.href, "");
    }
  }
  textLines.push(site.tagline, "");
  if (footerNote) {
    textLines.push(footerNote, "");
  }
  if (unsubscribeUrl) {
    textLines.push("Unsubscribe:", unsubscribeUrl);
  }
  const text = textLines.join("\n");

  const preheaderBlock = preheader
    ? `<!--[if !gte mso 9]><!-->
  <div style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;" aria-hidden="true">
    ${escapeNewsletterEmailText(preheader)}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>
  <!--<![endif]-->`
    : "";

  const featuredHtml = featured
    ? `<tr>
              <td style="padding:0 0 28px;">
                <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:${olive};font-family:${sans};">
                  Featured
                </p>
                ${renderRecipeCardHtml(featured)}
              </td>
            </tr>`
    : "";

  const blockHtml = blockRecipes.length
    ? `<tr>
              <td style="padding:0 0 8px;">
                <h2 style="margin:0 0 18px;font-family:${serif};font-size:26px;line-height:1.25;font-weight:400;color:${ink};">
                  ${escapeNewsletterEmailText(blockHeading)}
                </h2>
                ${blockRecipes.map((card) => renderRecipeCardHtml(card)).join("")}
              </td>
            </tr>`
    : "";

  const unsubHtml = isSafeNewsletterEmailHref(unsubscribeUrl)
    ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:${muted};font-family:${sans};">
                <a href="${escapeNewsletterEmailAttribute(unsubscribeUrl)}" style="color:${muted};text-decoration:underline;">Unsubscribe</a>
              </p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeNewsletterEmailText(subject)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Georgia, Times New Roman, serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${cream};color:${ink};font-family:${serif};">
  ${preheaderBlock}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${cream};margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:28px 16px 36px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;background-color:${paper};border:1px solid ${line};">
          <tr>
            <td style="padding:40px 32px 36px;font-family:${sans};color:${ink};">
              <p style="margin:0 0 4px;font-size:13px;line-height:1.2;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;color:${olive};font-family:${sans};">
                Mesa
              </p>
              <p style="margin:0 0 28px;font-size:11px;line-height:1.3;letter-spacing:0.18em;text-transform:uppercase;font-weight:500;color:${olive};font-family:${sans};">
                Kitchen Studio
              </p>
              <h1 style="margin:0 0 18px;font-family:${serif};font-size:32px;line-height:1.2;font-weight:400;color:${ink};">
                ${escapeNewsletterEmailText(subject)}
              </h1>
              ${
                intro
                  ? `<p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:${ink};font-family:${sans};white-space:pre-wrap;">${escapeNewsletterEmailText(intro)}</p>`
                  : ""
              }
              ${featuredHtml}
              ${blockHtml}
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${muted};font-family:${sans};">
                ${escapeNewsletterEmailText(site.tagline)}
              </p>
              ${
                footerNote
                  ? `<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${muted};font-family:${sans};">${escapeNewsletterEmailText(footerNote)}</p>`
                  : ""
              }
              ${unsubHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
