/** Shared transactional email via Resend when RESEND_API_KEY is set. */

export function siteUrl() {
  const fromAuth = process.env.AUTH_URL?.trim();
  if (fromAuth && !/localhost|127\.0\.0\.1/i.test(fromAuth)) {
    return fromAuth.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  return "https://www.mesakitchenstudio.com";
}

export async function sendTransactionalEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() || "Mesa Kitchen Studio <hello@mesakitchenstudio.com>";
  if (!key) {
    console.info("Email not configured:", input.subject, input.to);
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    console.error("Could not send email", await response.text());
    return false;
  }
  return true;
}

export function studioInboxEmail() {
  return (
    process.env.CONTACT_TO_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "hello@mesakitchenstudio.com"
  );
}
