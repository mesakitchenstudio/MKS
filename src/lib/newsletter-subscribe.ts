import { getDb } from "@/lib/db";
import {
  sendTransactionalEmailDetailed,
  studioInboxEmail,
  type SendTransactionalEmailResult,
} from "@/lib/email";
import { validateNewsletterEmail, type NewsletterResult } from "@/lib/newsletter";
import {
  buildNewsletterUnsubscribeUrl,
  createNewsletterUnsubscribeToken,
  hashNewsletterUnsubscribeToken,
  isActiveNewsletterStatus,
} from "@/lib/newsletter-unsubscribe";
import { buildNewsletterWelcomeEmail } from "@/lib/newsletter-welcome-email";

export type NewsletterMailer = (input: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}) => Promise<SendTransactionalEmailResult>;

export type SubscribeNewsletterDeps = {
  sendEmail?: NewsletterMailer;
};

function defaultMailer(
  input: Parameters<NewsletterMailer>[0],
): Promise<SendTransactionalEmailResult> {
  return sendTransactionalEmailDetailed(input);
}

function logWelcomeFailure(result: SendTransactionalEmailResult) {
  if (result.ok) return;
  console.error("Newsletter welcome email was not delivered", {
    reason: result.reason,
    subject: "Welcome to the Mesa table",
  });
}

async function issueUnsubscribeToken(db: ReturnType<typeof getDb>, subscriberId: string) {
  const { token, tokenHash } = createNewsletterUnsubscribeToken();
  await db.newsletterSubscriber.update({
    where: { id: subscriberId },
    data: { unsubscribeTokenHash: tokenHash },
  });
  return token;
}

async function sendWelcomeAndNotice(input: {
  email: string;
  source: string;
  subscriberId: string;
  sendEmail: NewsletterMailer;
  noticeKind: "new" | "reactivated";
}) {
  const db = getDb();
  const rawToken = await issueUnsubscribeToken(db, input.subscriberId);
  const unsubscribeUrl = buildNewsletterUnsubscribeUrl(rawToken);
  const welcome = buildNewsletterWelcomeEmail({ unsubscribeUrl });

  const welcomeResult = await input.sendEmail({
    to: input.email,
    subject: welcome.subject,
    html: welcome.html,
    text: welcome.text,
  });
  logWelcomeFailure(welcomeResult);

  const inbox = studioInboxEmail();
  const noticeSubject =
    input.noticeKind === "reactivated"
      ? `Newsletter re-subscribe: ${input.email}`
      : `Newsletter signup: ${input.email}`;
  void input.sendEmail({
    to: inbox,
    subject: noticeSubject,
    html: `<p>${input.noticeKind === "reactivated" ? "Newsletter subscriber reactivated." : "New newsletter subscriber."}</p><p><strong>${input.email}</strong></p><p>Source: ${input.source}</p>`,
  });
}

/**
 * Single opt-in subscribe.
 *
 * - New email → create active row, welcome email, studio notice
 * - Active duplicate → success, no welcome
 * - Unsubscribed → reactivate, welcome once, studio notice
 * - Welcome send failure does not roll back the subscription
 */
export async function subscribeNewsletterServer(
  email: string,
  source = "site",
  deps: SubscribeNewsletterDeps = {},
): Promise<NewsletterResult> {
  const validated = validateNewsletterEmail(email);
  if (!validated.ok) return validated;

  const sendEmail = deps.sendEmail ?? defaultMailer;

  try {
    const db = getDb();
    const existing = await db.newsletterSubscriber.findUnique({
      where: { email: validated.email },
    });

    if (existing && isActiveNewsletterStatus(existing.status)) {
      return { ok: true, duplicate: true };
    }

    if (existing && existing.status === "unsubscribed") {
      const updated = await db.newsletterSubscriber.update({
        where: { id: existing.id },
        data: {
          status: "active",
          unsubscribedAt: null,
          source,
        },
      });
      await sendWelcomeAndNotice({
        email: validated.email,
        source,
        subscriberId: updated.id,
        sendEmail,
        noticeKind: "reactivated",
      });
      return { ok: true };
    }

    const created = await db.newsletterSubscriber.create({
      data: {
        email: validated.email,
        source,
        status: "active",
      },
    });

    await sendWelcomeAndNotice({
      email: validated.email,
      source,
      subscriberId: created.id,
      sendEmail,
      noticeKind: "new",
    });

    return { ok: true };
  } catch (error) {
    console.error("Newsletter subscribe failed", error);
    return {
      ok: false,
      message: "We could not save your subscription. Please try again in a moment.",
    };
  }
}

export type UnsubscribeNewsletterResult =
  | { ok: true; alreadyUnsubscribed: boolean }
  | { ok: false; reason: "invalid" };

/**
 * Idempotent unsubscribe by raw token (never store the raw token).
 * Does not delete the subscriber row.
 */
export async function unsubscribeNewsletterByToken(
  rawToken: string,
): Promise<UnsubscribeNewsletterResult> {
  const token = rawToken.trim();
  if (!token || token.length < 32 || token.length > 128) {
    return { ok: false, reason: "invalid" };
  }
  if (!/^[a-fA-F0-9]+$/.test(token)) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const db = getDb();
    const tokenHash = hashNewsletterUnsubscribeToken(token);
    const row = await db.newsletterSubscriber.findUnique({
      where: { unsubscribeTokenHash: tokenHash },
    });
    if (!row) {
      return { ok: false, reason: "invalid" };
    }

    if (row.status === "unsubscribed") {
      return { ok: true, alreadyUnsubscribed: true };
    }

    await db.newsletterSubscriber.update({
      where: { id: row.id },
      data: {
        status: "unsubscribed",
        unsubscribedAt: new Date(),
      },
    });

    return { ok: true, alreadyUnsubscribed: false };
  } catch (error) {
    console.error("Newsletter unsubscribe failed", error);
    return { ok: false, reason: "invalid" };
  }
}
