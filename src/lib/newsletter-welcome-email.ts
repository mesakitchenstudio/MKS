import { site } from "@/data/site";
import { siteUrl } from "@/lib/email";

export const NEWSLETTER_WELCOME_SUBJECT = "Welcome to the Mesa table";

export function buildNewsletterWelcomeEmail(input: {
  unsubscribeUrl: string;
  recipesUrl?: string;
}) {
  const recipesUrl = input.recipesUrl || `${siteUrl().replace(/\/$/, "")}/recipes`;
  const unsubscribeUrl = input.unsubscribeUrl;
  const ink = "#2a2218";
  const muted = "#6b5e4f";
  const terracotta = "#c45c26";
  const cream = "#f7f1e8";

  const text = [
    "Welcome to the Mesa table.",
    "",
    "You're on the list.",
    "",
    "We'll send new recipes and seasonal notes when there's something worth sharing.",
    "",
    `Explore Mesa recipes: ${recipesUrl}`,
    "",
    site.tagline,
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${NEWSLETTER_WELCOME_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background:${cream};color:${ink};font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${cream};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fffdf9;border:1px solid #e6ddd0;">
          <tr>
            <td style="padding:36px 32px 28px;">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:${muted};font-family:system-ui,-apple-system,sans-serif;">
                ${site.shortName}
              </p>
              <h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;font-weight:normal;color:${ink};">
                Welcome to the Mesa table
              </h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${ink};">
                You're on the list.
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${ink};">
                We'll send new recipes and seasonal notes when there's something worth sharing.
              </p>
              <p style="margin:0 0 28px;">
                <a href="${recipesUrl}" style="color:${terracotta};font-size:16px;line-height:1.5;text-decoration:underline;">
                  Explore Mesa recipes →
                </a>
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.55;color:${muted};">
                ${site.tagline}
              </p>
              <p style="margin:0;padding-top:20px;border-top:1px solid #e6ddd0;font-size:12px;line-height:1.5;color:${muted};font-family:system-ui,-apple-system,sans-serif;">
                <a href="${unsubscribeUrl}" style="color:${muted};text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: NEWSLETTER_WELCOME_SUBJECT, html, text };
}
