import { site } from "@/data/site";
import { siteUrl } from "@/lib/email";

export const NEWSLETTER_WELCOME_SUBJECT = "Welcome to the Mesa table";

export const NEWSLETTER_WELCOME_PREHEADER =
  "You're on the Mesa list — new recipes and seasonal notes, when there's something worth sharing.";

/** Mesa brand tokens aligned with the public site (email-safe hex). */
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

export function buildNewsletterWelcomeEmail(input: {
  unsubscribeUrl: string;
  recipesUrl?: string;
  youtubeUrl?: string;
}) {
  const base = siteUrl().replace(/\/$/, "");
  const recipesUrl = input.recipesUrl || `${base}/recipes`;
  const youtubeUrl = input.youtubeUrl || site.social.youtube;
  const unsubscribeUrl = input.unsubscribeUrl;

  const text = [
    "Welcome to the Mesa table",
    "",
    "You're on the list.",
    "",
    "We'll send new recipes and seasonal notes when there's something worth sharing.",
    "",
    `Explore Mesa recipes:`,
    recipesUrl,
    "",
    "Prefer to cook along?",
    "Watch Mesa on YouTube:",
    youtubeUrl,
    "",
    site.tagline,
    "",
    "Unsubscribe:",
    unsubscribeUrl,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${NEWSLETTER_WELCOME_SUBJECT}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Georgia, Times New Roman, serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${cream};color:${ink};font-family:${serif};">
  <!-- Preheader: inbox preview only -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${cream};">
    ${NEWSLETTER_WELCOME_PREHEADER}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>
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

              <h1 style="margin:0 0 22px;font-family:${serif};font-size:30px;line-height:1.22;font-weight:400;color:${ink};">
                Welcome to the Mesa table
              </h1>

              <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${ink};font-family:${sans};">
                You're on the list.
              </p>
              <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:${ink};font-family:${sans};">
                We'll send new recipes and seasonal notes when there's something worth sharing.
              </p>

              <!-- Primary CTA: Explore recipes -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
                <tr>
                  <td align="left">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${recipesUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="12%" stroke="f" fillcolor="${terracotta}">
                      <w:anchorlock/>
                      <center style="color:${cream};font-family:Segoe UI,sans-serif;font-size:16px;font-weight:600;">Explore Mesa recipes →</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="${recipesUrl}"
                       style="display:inline-block;box-sizing:border-box;background-color:${terracotta};color:${cream};font-family:${sans};font-size:16px;font-weight:600;line-height:22px;text-align:center;text-decoration:none;padding:13px 28px;border-radius:6px;min-height:44px;mso-padding-alt:0;">
                      Explore Mesa recipes →
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:15px;line-height:1.55;color:${muted};font-family:${sans};">
                Prefer to cook along?
              </p>
              <p style="margin:0 0 32px;font-size:15px;line-height:1.55;font-family:${sans};">
                <a href="${youtubeUrl}" style="color:${terracotta};text-decoration:underline;">
                  Watch Mesa on YouTube →
                </a>
              </p>

              <p style="margin:0 0 28px;font-size:14px;line-height:1.55;color:${muted};font-family:${serif};font-style:italic;">
                ${site.tagline}
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${line};">
                <tr>
                  <td style="padding-top:20px;font-size:12px;line-height:1.5;color:${muted};font-family:${sans};">
                    <a href="${unsubscribeUrl}" style="color:${muted};text-decoration:underline;">Unsubscribe</a>
                  </td>
                </tr>
              </table>
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
