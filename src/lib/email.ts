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

export function isTransactionalEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function transactionalEmailFromAddress() {
  return (
    process.env.EMAIL_FROM?.trim() || "Mesa Kitchen Studio <hello@mesakitchenstudio.com>"
  );
}

export type SendTransactionalEmailResult =
  | { ok: true; id?: string }
  | { ok: false; reason: "not_configured" | "provider_error" };

export async function sendTransactionalEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}): Promise<boolean> {
  const result = await sendTransactionalEmailDetailed(input);
  return result.ok;
}

/** Prefer this when callers need to log why delivery failed without guessing. */
export async function sendTransactionalEmailDetailed(input: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Extra MIME headers (e.g. List-Unsubscribe). Passed through Resend `headers`. */
  headers?: Record<string, string>;
}): Promise<SendTransactionalEmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = transactionalEmailFromAddress();
  if (!key) {
    console.error(
      "Transactional email not configured: set RESEND_API_KEY (and optionally EMAIL_FROM). Subject:",
      input.subject,
    );
    return { ok: false, reason: "not_configured" };
  }

  const customHeaders = input.headers
    ? Object.fromEntries(
        Object.entries(input.headers).filter(
          ([name, value]) => Boolean(name.trim()) && Boolean(String(value ?? "").trim()),
        ),
      )
    : undefined;

  try {
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
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(customHeaders && Object.keys(customHeaders).length > 0
          ? { headers: customHeaders }
          : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Could not send email via Resend", response.status, detail.slice(0, 500));
      return { ok: false, reason: "provider_error" };
    }

    let id: string | undefined;
    try {
      const payload = (await response.json()) as { id?: string };
      if (typeof payload.id === "string" && payload.id.trim()) {
        id = payload.id.trim();
      }
    } catch {
      // Provider accepted the send; id is optional diagnostics only.
    }
    return { ok: true, id };
  } catch (error) {
    console.error("Could not send email via Resend", error);
    return { ok: false, reason: "provider_error" };
  }
}

export function studioInboxEmail() {
  return (
    process.env.CONTACT_TO_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "hello@mesakitchenstudio.com"
  );
}
